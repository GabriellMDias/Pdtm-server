import { QueryConfig, QueryResult } from "pg"
import { insertLogTransacao } from "../logTransacao"
import { generateStockMovement, GenerateStockMovementParams } from "./estoque"
import { isProductActive } from '../products'
import pgClient from "../../db"
import { logger } from "../../../lib/logger"

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
        throw error
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

                        INSERT INTO producaoitem (
                            id_producao,
                            id_produto,
                            qtdembalagemproducao,
                            qtdembalagemproduto
                        )
                        (
                            SELECT
                                (SELECT last_value FROM producao_id_seq) as id_producao,
                                id_produto,
                                qtdembalagemreceita as qtdembalagemproducao,
                                qtdembalagemproduto
                            FROM receitaitem
                            WHERE id_receita = (
                                SELECT id_receita FROM receitaproduto WHERE id_produto = ${producaoProps.idProduto}
                            )
                            AND baixaestoque = true	
                        );
                    END;
                $$;
        `
    }

    try {
        const result = await pgClient.query(query) 
    } catch (error) {
        throw error
    }
}

export const lancamentoProducao = async (producaoProps: ProducaoProps) => {
    try {
        const productActiveStatus = await isProductActive(producaoProps.idProduto, producaoProps.idLoja)

        if(!productActiveStatus) {
            throw new Error(`Código ${producaoProps.idProduto} excluído.`);
        }

        // Used itens for recipe info (Only produced product is inserted in logtransacao)
        const recipeItems = await getRecipeItems(producaoProps.idProduto, producaoProps.idLoja, producaoProps.quantidade)
        recipeItems.map(async (recipeItem) => {
            const generateStockDataRecipeItem: GenerateStockMovementParams = {
                idInOrOut: 1, 
                idMovementType: 23, 
                idProduct: recipeItem.id_produto, 
                idStore: producaoProps.idLoja, 
                idUser: producaoProps.idUser, 
                quantity: parseFloat(recipeItem.qtd_utilizada),
                updateCost: false
            } 
            await generateStockMovement(generateStockDataRecipeItem)
        })
    
        // Produced Product info (Only produced product is inserted in logtransacao)
        const totais = recipeItems.reduce(
        (acc, current) => {
            acc.totalCustoComImposto += Number(current.custocomimposto_utilizado) || 0
            acc.totalCustoSemImposto += Number(current.custosemimposto_utilizado) || 0
            return acc
        },
        {
            totalCustoComImposto: 0,
            totalCustoSemImposto: 0,
        }
        )
    
        const generateStockDataProduced: GenerateStockMovementParams = {
            idInOrOut: 0, 
            idMovementType: 23, 
            idProduct: producaoProps.idProduto, 
            idStore: producaoProps.idLoja, 
            idUser: producaoProps.idUser, 
            quantity: producaoProps.quantidade,
            updateCost: true,
            costs: {
                custocomimposto: Number((totais.totalCustoComImposto / producaoProps.quantidade).toFixed(3)),
                custosemimposto: Number((totais.totalCustoSemImposto / producaoProps.quantidade).toFixed(3))
            }
        } 

        const logTransacaoDataProduced = {
            idStore: producaoProps.idLoja, 
            idProduct: producaoProps.idProduto, 
            idForm: 85,
            idTransactionType: 0,
            idUser: producaoProps.idUser,
            ipTerminal: producaoProps.ipTerminal
        }
    
        await pgClient.query('BEGIN')

        await generateStockMovement(generateStockDataProduced)
        await insertLogTransacao(logTransacaoDataProduced)
        await insertProducao(producaoProps)

        await pgClient.query('COMMIT')

        return true
    } catch (error) {
        logger.error('Erro ao processar lançamento da produção:', error, '\nDado não transmitido: ', JSON.stringify(producaoProps));
        await pgClient.query('ROLLBACK')
        return false
    }
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

    try {
        const result: QueryResult<Recipe> = await pgClient.query(query)
        return result
    } catch (error) {
        throw error
    }
    
}