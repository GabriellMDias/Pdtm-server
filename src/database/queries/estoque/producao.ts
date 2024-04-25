import { QueryConfig, QueryResult } from "pg"
import { insertLogTransacao } from "../logTransacao"
import { generateStockMovement } from "./estoque"
import pgClient from "../../db"

type Recipe = {
    id: number,
    descricao: string,
    id_produto: number
}

type RecipeItem = {
    id_produto: number,
    custocomimposto_utilizado: string,
    custosemimposto_utilizado: string,
    fatorconversao: string,
    qtd_utilizada: string
}

export type ProducaoProps = {
    idLoja: number, 
    idProduto: number, 
    quantidade: number,
    ipTerminal: string,
    idUser: number
}

const getRecipeItems = async (idProduct: number, idStore: number, qttProduced: number) => {
    const query: QueryConfig = {
        text: `
        SELECT 
            ri.id_produto,
            ((pc.customediocomimposto * ((ri.qtdembalagemreceita::numeric(12,3)/ri.qtdembalagemproduto::numeric(12,3))*$1)/rp.rendimento))::numeric(12,4) as custocomimposto_utilizado,
            ((pc.customediosemimposto * ((ri.qtdembalagemreceita::numeric(12,3)/ri.qtdembalagemproduto::numeric(12,3))*$1)/rp.rendimento))::numeric(12,4) as custosemimposto_utilizado,
            ri.fatorconversao,
            (((ri.qtdembalagemreceita::numeric(12,3)/ri.qtdembalagemproduto::numeric(12,3))*$1)/rp.rendimento)::numeric(12,3) as qtd_utilizada
        FROM receitaitem ri
        JOIN receitaproduto rp ON rp.id_receita = ri.id_receita
        JOIN produtocomplemento pc ON pc.id_produto = ri.id_produto
        WHERE rp.id_produto = $2
        AND ri.baixaestoque = true
        AND pc.id_loja = $3;
        `,
        values: [qttProduced, idProduct, idStore]
    }

    try {
        const result: QueryResult<RecipeItem> = await pgClient.query(query) 
        return result.rows
    } catch (error) {
        console.error('Erro ao obter itens da receita:', error);
        return []
    }
}

const insertProducao = async (producaoProps: ProducaoProps) => {
    const query: QueryConfig = {
        text: `
                DO $$
                    DECLARE
                        p_custocomimposto numeric(13,4);
                        p_customediocomimposto numeric(13,4);
                        p_quantidade numeric(12,3);
                        p_id_aliquotacredito integer;
                        p_id_aliquotadebito integer;
                        p_piscofins numeric(11,2);
                    BEGIN
                        p_quantidade := ${producaoProps.quantidade};	
                        SELECT 
                            pc.custocomimposto,
                            pc.customediocomimposto,
                            pa.id_aliquotacredito,
                            pa.id_aliquotadebito,
                            ((tpc.valorpis + tpc.valorcofins)*p_quantidade*pc.custocomimposto/100)::numeric(11,2) as piscofins
                        INTO
                            p_custocomimposto,
                            p_customediocomimposto,
                            p_id_aliquotacredito,
                            p_id_aliquotadebito,
                            p_piscofins
                        FROM produto p
                        JOIN tipopiscofins tpc ON tpc.id = p.id_tipopiscofins 
                        JOIN produtoaliquota pa ON pa.id_produto = p.id
                        JOIN aliquota a ON a.id = pa.id_aliquotacreditocusto 
                        JOIN produtocomplemento pc ON pc.id_produto = p.id
                        WHERE pc.id_loja = ${producaoProps.idLoja}
                        AND p.id = ${producaoProps.idProduto};

                        INSERT INTO producao
                        (
                            id_loja,
                            data,
                            id_produto,
                            quantidade,
                            custocomimposto,
                            id_aliquotacredito,
                            id_aliquotadebito,
                            piscofins,
                            customediocomimposto
                        )
                        VALUES
                        (
                            ${producaoProps.idLoja},
                            NOW()::date,
                            ${producaoProps.idProduto},
                            p_quantidade,
                            p_custocomimposto,
                            p_id_aliquotacredito,
                            p_id_aliquotadebito,
                            p_piscofins,
                            p_customediocomimposto
                        );
                    END;
                $$;
        `
    }

    try {
        const result = await pgClient.query(query) 
    } catch (error) {
        console.error('Erro ao incluir producao no banco de dados:', error);
    }
}

export const lancamentoProducao = async (producaoProps: ProducaoProps) => {
    // Used itens for recipe info (Only produced product is inserted in logtransacao)
    const recipeItems = await getRecipeItems(producaoProps.idProduto, producaoProps.idLoja, producaoProps.quantidade)
    recipeItems.map(async (recipeItem) => {
        const generateStockDataRecipeItem = {
            idInOrOut: 1, 
            idMovementType: 23, 
            idProduct: recipeItem.id_produto, 
            idStore: producaoProps.idLoja, 
            idUser: producaoProps.idUser, 
            quantity: parseFloat(recipeItem.qtd_utilizada)
        } 
        await generateStockMovement(generateStockDataRecipeItem)
    })

    // Produced Product info (Only produced product is inserted in logtransacao)
    const totalCostRecipeItems = recipeItems.reduce((acc, current) => acc + parseFloat(current.custocomimposto_utilizado), 0)

    const generateStockDataProduced = {
        idInOrOut: 0, 
        idMovementType: 23, 
        idProduct: producaoProps.idProduto, 
        idStore: producaoProps.idLoja, 
        idUser: producaoProps.idUser, 
        quantity: producaoProps.quantidade,
        custocomimpostototalentrada: totalCostRecipeItems
    } 
    const logTransacaoDataProduced = {
        idStore: producaoProps.idLoja, 
        idProduct: producaoProps.idProduto, 
        idForm: 85,
        idTransactionType: 0,
        idUser: producaoProps.idUser,
        ipTerminal: producaoProps.ipTerminal
    }

    await generateStockMovement(generateStockDataProduced)
    await insertLogTransacao(logTransacaoDataProduced)
    await insertProducao(producaoProps)
}

export const getRecipes = async (idStore: number) => {
    const query: QueryConfig = {
        text: `SELECT 
                    r.id,
                    r.descricao,
                    rp.id_produto
                FROM receita r
                JOIN receitaproduto rp ON rp.id_receita = r.id
                JOIN receitaloja rl ON rl.id_receita = r.id
                WHERE id_situacaocadastro = 1
                AND rl.id_loja = $1;`,
        values: [idStore]
    }

    const result: QueryResult<Recipe> = await pgClient.query(query)

    return result
}