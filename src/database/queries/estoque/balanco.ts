import { QueryConfig, QueryResult } from "pg";
import pgClient from "../../db";
import { getProductParams } from "../products";
import { logger } from "../../../lib/logger";
import { insertLogTransacao } from "../logTransacao";

export type BalancoItemProps = {
    idLoja: number
    idBalanco: number
    idProduto: number
    quantidade: number
    ipTerminal: string,
    idUser: number
}

type Balanco = {
    id: number,
    id_loja: number,
    descricao: string,
    estoque: string,
    id_situacaobalanco: number
}

const insertBalancoItem = async (balancoItemProps: BalancoItemProps) => {
    try {
        const productParams = await getProductParams(balancoItemProps.idProduto, balancoItemProps.idLoja)
        
        const query: QueryConfig = {
            text: `
                DO $$
                    DECLARE 
                        p_quantidadeanterior numeric(12,3);
                        p_id_loja integer;
                        p_id_balanco integer;
                        p_id_produto integer;
                        p_quantidade numeric(12,3);
                        p_custosemimposto numeric(13,4);
                        p_custocomimposto numeric(13,4);
                        p_customediosemimposto numeric(13,4);
                        p_customediocomimposto numeric(13,4);
                    BEGIN
                        /* Definição dos Parâmetros */
                        p_id_loja:= ${balancoItemProps.idLoja};
                        p_id_balanco:= ${balancoItemProps.idBalanco};
                        p_id_produto:= ${balancoItemProps.idProduto};
                        p_quantidade:= ${balancoItemProps.quantidade}; 
                        p_custosemimposto:= ${productParams.custosemimposto}; 
                        p_custocomimposto:= ${productParams.custocomimposto};
                        p_customediosemimposto:= ${productParams.customediosemimposto};
                        p_customediocomimposto:= ${productParams.customediocomimposto};
                    
                        /* Verifica se já existe um lançamento para o código selecionado */
                        SELECT CASE WHEN quantidade IS NULL THEN 0 ELSE quantidade END AS quantidade
                        INTO p_quantidadeanterior
                        FROM balancoestoque
                        WHERE id_balanco = p_id_balanco
                        AND id_produto = p_id_produto;
                        
                        IF p_quantidadeanterior IS NOT NULL THEN
                            /* Se existir, realiza um UPDATE */
                            UPDATE balancoestoque
                            SET
                                id_loja = p_id_loja,
                                quantidade = (p_quantidadeanterior + p_quantidade),
                                custosemimposto = p_custosemimposto,
                                custocomimposto = p_custocomimposto,
                                id_tipobalancoestoque = 0, /* 0 = IMPORTADO */	
                                customediosemimposto = p_customediosemimposto,
                                customediocomimposto = p_customediocomimposto
                            WHERE id_balanco = p_id_balanco
                            AND id_produto = p_id_produto;
                        ELSE
                            /* Se não existir, realiza um INSERT */
                            INSERT INTO balancoestoque
                            (
                                id_loja,
                                id_balanco,
                                id_produto,
                                quantidade,
                                custosemimposto,
                                custocomimposto,
                                id_tipobalancoestoque,
                                customediocomimposto,
                                customediosemimposto,
                                quantidaderecontagem,
                                quantidadeconferencia,
                                posicaoestoquecongelamento
                            )
                            VALUES(
                                p_id_loja,
                                p_id_balanco,
                                p_id_produto,
                                p_quantidade,
                                p_custosemimposto,
                                p_custocomimposto,
                                0, /* 0 = IMPORTADO */	
                                p_customediocomimposto,
                                p_customediosemimposto,
                                NULL,
                                NULL,
                                NULL
                            );
                        END IF;
                    END;
                $$;
            `
        }

        if(productParams.id_situacaocadastro === 0) {
            throw new Error(`Código ${balancoItemProps.idProduto} excluído.`);
        }

        await pgClient.query(query) 
    } catch (error) {
        throw error
    }
}

const getSituacaoBalanco = async (idBalanco: number, idLoja: number) => {
    const querySituacaoBalanco: QueryConfig = {
        text: `
            SELECT
                id_situacaobalanco
            FROM balanco
            WHERE 
            id = $1
            AND id_loja = $2
        `,
        name: 'getSituacaoBalanco',
        values: [idBalanco, idLoja]
    }

    try {
        const result: QueryResult<{id_situacaobalanco: number}> = await pgClient.query(querySituacaoBalanco)
        return result.rows[0].id_situacaobalanco
    } catch (error) {
        throw error
    }
}

export const getBalancos = async (idStore: number) => {
    const queryBalancos: QueryConfig = {
        text: `
        SELECT 
            b.id,
            b.id_loja,
            b.descricao,
            teb.descricao as estoque,
            b.id_situacaobalanco
        FROM balanco b
        JOIN tipoestoquebalanco teb ON teb.id = b.id_tipoestoquebalanco
        WHERE b.id_loja = $1
        `,
        name: 'getBalancos',
        values: [idStore]
    } 

    try {
        const result: QueryResult<Balanco> = await pgClient.query(queryBalancos)
        return result.rows
    } catch (error) {
        throw error
    }
}

export const lancamentoBalanco = async (balancoItemProps: BalancoItemProps) => {
    const logTransacaoData = {
        idStore: balancoItemProps.idLoja, 
        idProduct: balancoItemProps.idProduto, 
        idForm: 61,
        idTransactionType: 2,
        idUser: balancoItemProps.idUser,
        ipTerminal: balancoItemProps.ipTerminal
    }

    try {
        const situacaoBalanco = await getSituacaoBalanco(balancoItemProps.idBalanco, balancoItemProps.idLoja)

        if (situacaoBalanco === 0) {
            await pgClient.query('BEGIN')

            await insertLogTransacao(logTransacaoData)
            await insertBalancoItem(balancoItemProps)

            await pgClient.query('COMMIT')

            return true
        } else if (situacaoBalanco === 1) {
            throw new Error('Balanço já foi finalizado')
        } else {
            throw new Error('Balanço foi excluído')
        }

        
    } catch (error) {
        logger.error('Erro ao processar lançamento do balanço:', error, '\nDado não transmitido: ', JSON.stringify(balancoItemProps));
        await pgClient.query('ROLLBACK')
        return false
    }
}