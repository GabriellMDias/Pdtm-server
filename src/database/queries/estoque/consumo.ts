import pgClient from "../../db";
import { QueryConfig, QueryResult } from "pg";
import { generateStockMovement } from "./estoque";
import { insertLogTransacao } from "../logTransacao";
import { getProductParams } from "../products";
import { logger } from "../../../lib/logger";

export type ConsumoProps = {
    idLoja: number, 
    idProduto: number, 
    quantidade: number, 
    idTipoConsumo: number, 
    ipTerminal: string,
    idUser: number
}

const insertConsumo = async (consumoProps: ConsumoProps) => {
    try {
        const productParams = await getProductParams(consumoProps.idProduto, consumoProps.idLoja)

        const query: QueryConfig = {
            text: `
                    DO $$
                        DECLARE
                            p_quantidadeconsumoanterior numeric(12,3);
                            p_emitenota boolean;
                        BEGIN
                            /*Verifica se o tipo consumo emite nota*/
	    		    		SELECT emitenota 
	    		    		INTO p_emitenota
	    		    		FROM tipoconsumo 
	    		    		WHERE id = ${consumoProps.idTipoConsumo};
                            /* Verifica se já existe um registro com os mesmos valores na tabela consumo */
                            SELECT quantidade
                            INTO   p_quantidadeconsumoanterior
                            FROM consumo
                            WHERE id_loja = ${consumoProps.idLoja}
                            AND id_produto = ${consumoProps.idProduto}
                            AND data = NOW()::date
                            AND id_tipoconsumo = ${consumoProps.idTipoConsumo};

                            IF p_quantidadeconsumoanterior IS NOT NULL THEN
                                /* Se existir, realiza um UPDATE */
                                UPDATE consumo 
                                SET
                                    quantidade = (p_quantidadeconsumoanterior + ${consumoProps.quantidade}),
                                    custocomimposto = ${productParams.custocomimposto},
                                    custosemimposto = ${productParams.custosemimposto},
                                    id_aliquotacredito = ${productParams.id_aliquotacreditocusto},
                                    piscofins = ${productParams.piscofins},
                                    id_tipopiscofins = ${productParams.id_tipopiscofins},
                                    customediocomimposto = ${productParams.customediocomimposto},
                                    customediosemimposto = ${productParams.customediosemimposto},
                                    valoripi = ${productParams.valoripi},
                                    valoricmssubstituicao = ${productParams.valoricmssubstituicao},
                                    valorbasepiscofins = ${productParams.valorbasepiscofins},
                                    valorpis = ${productParams.valorpis},
                                    valorcofins = ${productParams.valorcofins},
                                    emitenota = p_emitenota
                                WHERE id_loja = ${consumoProps.idLoja}
                                AND id_produto = ${consumoProps.idProduto}
                                AND data = NOW()::date
                                AND id_tipoconsumo = ${consumoProps.idTipoConsumo};
                            ELSE
                                /* Se não existir registro, realiza um INSERT */
                                INSERT INTO consumo
                                (
                                    id_loja, 
                                    id_produto, 
                                    data, 
                                    id_tipoconsumo, 
                                    quantidade, 
                                    custocomimposto, 
                                    custosemimposto, 
                                    id_aliquotacredito,
                                    piscofins, 
                                    id_tipopiscofins, 
                                    observacao, 
                                    customediocomimposto, 
                                    customediosemimposto, 
                                    valoripi, 
                                    valoricmssubstituicao, 
                                    id_notasaida, 
                                    valorbasepiscofins, 
                                    valorpis, 
                                    valorcofins, 
                                    emitenota
                                )
                                VALUES(
                                    ${consumoProps.idLoja},
                                    ${consumoProps.idProduto},
                                    NOW()::date,
                                    ${consumoProps.idTipoConsumo},
                                    ${consumoProps.quantidade},
                                    ${productParams.custocomimposto},
                                    ${productParams.custosemimposto},
                                    ${productParams.id_aliquotacreditocusto},
                                    ${productParams.piscofins},
                                    ${productParams.id_tipopiscofins},
                                    '',
                                    ${productParams.customediocomimposto},
                                    ${productParams.customediosemimposto},
                                    ${productParams.valoripi},
                                    ${productParams.valoricmssubstituicao},
                                    null,
                                    ${productParams.valorbasepiscofins}, /*Custo Médio com imposto - alíquota + valoripi*/
                                    ${productParams.valorpis},
                                    ${productParams.valorcofins},
                                    p_emitenota
                                );
                            END IF;
                        END;
                    $$;
            `
        }

        if(productParams.id_situacaocadastro === 0) {
            throw new Error(`Código ${consumoProps.idProduto} excluído.`);
        }

        await pgClient.query(query) 
    } catch (error) {
        throw error
    }
}

export const lancamentoConsumo = async (consumoProps: ConsumoProps) => {
    const generateStockData = {
        idInOrOut: 1, 
        idMovementType: 11, 
        idProduct: consumoProps.idProduto, 
        idStore: consumoProps.idLoja, 
        idUser: consumoProps.idUser, 
        quantity: consumoProps.quantidade
    } 
    const logTransacaoData = {
        idStore: consumoProps.idLoja, 
        idProduct: consumoProps.idProduto, 
        idForm: 9,
        idTransactionType: 1,
        idUser: consumoProps.idUser,
        ipTerminal: consumoProps.ipTerminal
    }

    try {
        await pgClient.query('BEGIN')

        await generateStockMovement(generateStockData)
        await insertLogTransacao(logTransacaoData)
        await insertConsumo(consumoProps)

        await pgClient.query('COMMIT')

        return true
    } catch (error) {
        logger.error('Erro ao processar lançamento do consumo:', error, '\nDado não transmitido: ', JSON.stringify(consumoProps));
        await pgClient.query('ROLLBACK')
        return false
    }
    
}

export const lancamentoConsumoWithQuery = async (idLoja: number, idProduto: number, quantidade: number, idTipoConsumo: number, ipTerminal: string) => {
    const query: QueryConfig = {
        text: `DO $$
                DECLARE 
                    p_id_loja integer;
                    p_id_produto integer;
                    p_quantidade numeric(12,3);
                    p_quantidadeconsumoanterior numeric(12,3);
                    p_custocomimposto numeric(13,4);
                    p_custosemimposto numeric(13,4);
                    p_customediocomimposto numeric(13,4);
                    p_customediosemimposto numeric(13,4);
                    p_estoqueanterior numeric(18,3);
                    p_id_tipoconsumo integer;
                    p_ipterminal VARCHAR(80);
                    p_versao VARCHAR(50);
                    p_statuscongelamento boolean;
                    p_qtdembalagem_pri integer;
                    p_id_produto_ass integer;
                    p_qtdembalagem_ass integer;
                    p_percentualcustoestoque_ass numeric(19,4);
                    p_id_aliquotacreditocusto integer;
                    p_piscofins numeric(11,2);
                    p_id_tipopiscofins integer;
                    p_valoripi numeric(13,4);
                    p_valoricmssubstituicao numeric(13,4);
                    p_valorbasepiscofins numeric(11,4);
                    p_valorpis numeric(11,4);
                    p_valorcofins numeric(11,4);
                    p_emitenota boolean;
                BEGIN
                    /*Definição dos parâmetros*/
                    p_id_loja:= ${idLoja};
                    p_id_produto:= ${idProduto};
                    p_quantidade:= ${quantidade};
                    p_id_tipoconsumo:= ${idTipoConsumo};
                    p_ipterminal:= '${ipTerminal}';
                    /*Verifica se o produto não tem estoque próprio por meio de associação*/
                    SELECT 
                        ass.qtdembalagem as qtdembalagem_pri,
                        ai.id_produto as id_produto_ass,
                        ai.qtdembalagem as qtdembalagem_ass,
                        ai.percentualcustoestoque as percentualcustoestoque_ass
                    INTO
                        p_qtdembalagem_pri,
                        p_id_produto_ass,
                        p_qtdembalagem_ass,
                        p_percentualcustoestoque_ass
                    FROM associadoitem ai
                    JOIN associado ass ON ass.id = ai.id_associado
                    WHERE ai.aplicaestoque = 't'
                    AND ass.id_produto = p_id_produto;
                    /*Parametros do produto*/
                    SELECT 
                        custosemimposto,
                        custocomimposto,
                        customediosemimposto,
                        customediocomimposto,
                        estoque
                    INTO
                        p_custosemimposto,
                        p_custocomimposto,
                        p_customediosemimposto,
                        p_customediocomimposto,
                        p_estoqueanterior
                    FROM produtocomplemento 
                    WHERE id_produto = CASE 
                                            WHEN p_id_produto_ass IS NULL THEN p_id_produto 
                                            ELSE p_id_produto_ass 
                                        END
                    AND id_loja = p_id_loja;
                    /*Parametros para inclusao na tabela consumo*/
                    SELECT 
                        pa.id_aliquotacreditocusto, 
                        (tpc.valorpis + tpc.valorcofins)::numeric(11,2) as piscofins,
                        p.id_tipopiscofinscredito as id_tipopiscofins,
                        pc.valoripi as valoripi,
                        pc.valoricmssubstituicao as valoricmssubstituicao,
                        (p_customediocomimposto - 
                        ((p_customediocomimposto * a.porcentagemfinal)/100)
                        + pc.valoripi)::numeric(11,4) as valorbasepiscofins,
                        (tpc.valorpis * (p_customediocomimposto - 
                        ((p_customediocomimposto * a.porcentagemfinal)/100)
                        + pc.valoripi))/100::numeric(11,4) as valorpis,
                        (tpc.valorcofins * (p_customediocomimposto - 
                        ((p_customediocomimposto * a.porcentagemfinal)/100)
                        + pc.valoripi))/100::numeric(11,4) as valorcofins
                    INTO
                        p_id_aliquotacreditocusto,
                        p_piscofins,
                        p_id_tipopiscofins,
                        p_valoripi,
                        p_valoricmssubstituicao,
                        p_valorbasepiscofins,
                        p_valorpis,
                        p_valorcofins
                    FROM produto p 
                    JOIN tipopiscofins tpc ON tpc.id = p.id_tipopiscofinscredito 
                    JOIN produtoaliquota pa ON pa.id_produto = p.id
                    JOIN aliquota a ON a.id = pa.id_aliquotacreditocusto 
                    JOIN produtocomplemento pc ON pc.id_produto = p.id
                    WHERE p.id = p_id_produto
                    AND pc.id_loja = p_id_loja;
                    /*Verifica se o tipo consumo emite nota*/
                    SELECT emitenota 
                    INTO p_emitenota
                    FROM tipoconsumo 
                    WHERE id = p_id_tipoconsumo;
                    /*Verifica a Versão*/
                    SELECT 
                        versao
                    INTO
                        p_versao
                    FROM versao 
                    WHERE id_programa = 0;
                    /*Verifica se o estoque está congelado*/
                    SELECT 
                        valor
                    INTO
                        p_statuscongelamento
                    FROM 
                    parametrovalor pv 
                    JOIN parametro p ON p.id = pv.id_parametro
                    WHERE p.descricao = 'Estoque Congelado'
                    AND id_loja = p_id_loja;
                    
                    IF p_statuscongelamento THEN
                        /*Se o estoque estiver congelado, insere na tabela estoquecongelado. 
                        Obs: Custos devem se manter zerados*/
                        INSERT INTO estoquecongelado 
                        (
                            id_produto, 
                            id_loja, 
                            id_tipomovimentacao, 
                            quantidade, 
                            baixareceita, 
                            baixaassociado, 
                            baixaperda, 
                            observacao,
                            custocomimposto,
                            customediocomimposto,
                            custosemimposto,
                            customediosemimposto,
                            data,
                            id_estoquecongeladotipoentradasaida,
                            id_venda
                        ) 
                        VALUES
                        (
                            p_id_produto, 
                            p_id_loja, 
                            11, /*Tipo Movimentação Consumo*/
                            p_quantidade, 
                            false, 
                            true, 
                            false, 
                            '', 
                            0.0000, 
                            0.0000, 
                            0.0000, 
                            0.0000, 
                            NOW()::date, 
                            1 /*Entrada*/, 
                            null
                        );
                    ELSE
                        /*Se o estoque não estiver congelado, insere na tabela logestoque e atualiza o estoque.*/
                        INSERT INTO logestoque
                        (
                            id_loja,
                            id_produto,
                            quantidade,
                            id_tipomovimentacao,
                            datahora,
                            id_usuario,
                            observacao,
                            estoqueanterior,
                            estoqueatual,
                            id_tipoentradasaida,
                            custosemimposto,
                            custocomimposto,
                            datamovimento,
                            customediocomimposto,
                            customediosemimposto,
                            id_venda
                        )
                        VALUES
                        (
                            p_id_loja,
                            CASE 
                                WHEN p_id_produto_ass IS NULL THEN p_id_produto 
                                ELSE p_id_produto_ass 
                            END,
                            CASE
                                WHEN p_id_produto_ass IS NULL THEN p_quantidade
                                ELSE (p_quantidade*(p_qtdembalagem_pri::numeric/p_qtdembalagem_ass::numeric)) + ((p_percentualcustoestoque_ass/100)*p_quantidade*(p_qtdembalagem_pri::numeric/p_qtdembalagem_ass::numeric))
                            END,
                            11,
                            to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')::timestamp,
                            66, /*Usuário COLETORM*/
                            '',
                            p_estoqueanterior,
                            CASE
                                WHEN p_id_produto_ass IS NULL THEN p_estoqueanterior - p_quantidade
                                ELSE p_estoqueanterior - ((p_quantidade*(p_qtdembalagem_pri::numeric/p_qtdembalagem_ass::numeric)) + ((p_percentualcustoestoque_ass/100)*p_quantidade*(p_qtdembalagem_pri::numeric/p_qtdembalagem_ass::numeric)))
                            END,
                            1,
                            p_custosemimposto,
                            p_custocomimposto,
                            NOW()::date,
                            p_customediocomimposto,
                            p_customediosemimposto,
                            null
                        );
                        /*Subtrai o estoque do produto*/
                        UPDATE produtocomplemento
                        SET estoque = CASE
                                        WHEN p_id_produto_ass IS NULL THEN p_estoqueanterior - p_quantidade
                                        ELSE p_estoqueanterior - ((p_quantidade*(p_qtdembalagem_pri::numeric/p_qtdembalagem_ass::numeric)) + ((p_percentualcustoestoque_ass/100)*p_quantidade*(p_qtdembalagem_pri::numeric/p_qtdembalagem_ass::numeric)))
                                    END
                        WHERE id_loja = p_id_loja
                        AND id_produto = CASE 
                                            WHEN p_id_produto_ass IS NULL THEN p_id_produto 
                                            ELSE p_id_produto_ass 
                                        END;
                    END IF;
                
                        /*Insere na tabela logtransacao*/
                        INSERT INTO logtransacao
                        (
                            id_loja,
                            referencia,
                            id_formulario,
                            id_tipotransacao,
                            observacao,
                            datahora,
                            id_usuario,
                            datamovimento,
                            ipterminal,
                            versao,
                            id_referencia,
                            alteracao
                        )
                        VALUES
                        (
                            p_id_loja,
                            p_id_produto,
                            9, /*Consumo*/
                            1, /*ALTERAÇÃO*/
                            '',
                            to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')::timestamp,
                            66, /*Usuário COLETORM*/
                            NOW()::date,
                            '/' || p_ipterminal,
                            p_versao,
                            p_id_produto,
                            ''
                        );
                
                
                        /* Verifica se já existe um registro com os mesmos valores na tabela consumo */
                        SELECT quantidade
                        FROM consumo
                        WHERE id_loja = p_id_loja
                        AND id_produto = p_id_produto
                        AND data = NOW()::date
                        AND id_tipoconsumo = p_id_tipoconsumo
                        INTO   p_quantidadeconsumoanterior;
                        
                        IF p_quantidadeconsumoanterior IS NOT NULL THEN
                            /* Se existir, realiza um UPDATE */
                            UPDATE consumo 
                            SET
                                quantidade = (p_quantidadeconsumoanterior + p_quantidade),
                                custocomimposto = p_custocomimposto,
                                custosemimposto = p_custosemimposto,
                                id_aliquotacredito = p_id_aliquotacreditocusto,
                                piscofins = p_piscofins,
                                id_tipopiscofins = p_id_tipopiscofins,
                                customediocomimposto = p_customediocomimposto,
                                customediosemimposto = p_customediosemimposto,
                                valoripi = p_valoripi,
                                valoricmssubstituicao = p_valoricmssubstituicao,
                                valorbasepiscofins = p_valorbasepiscofins,
                                valorpis = p_valorpis,
                                valorcofins = p_valorcofins,
                                emitenota = p_emitenota
                            WHERE id_loja = p_id_loja
                            AND id_produto = p_id_produto
                            AND data = NOW()::date
                            AND id_tipoconsumo = p_id_tipoconsumo;
                        ELSE
                            /* Se não existir registro, realiza um INSERT */
                            INSERT INTO consumo
                            (
                                id_loja, 
                                id_produto, 
                                data, 
                                id_tipoconsumo, 
                                quantidade, 
                                custocomimposto, 
                                custosemimposto, 
                                id_aliquotacredito,
                                piscofins, 
                                id_tipopiscofins, 
                                observacao, 
                                customediocomimposto, 
                                customediosemimposto, 
                                valoripi, 
                                valoricmssubstituicao, 
                                id_notasaida, 
                                valorbasepiscofins, 
                                valorpis, 
                                valorcofins, 
                                emitenota
                            )
                            VALUES(
                                p_id_loja,
                                p_id_produto,
                                NOW()::date,
                                p_id_tipoconsumo,
                                p_quantidade,
                                p_custocomimposto,
                                p_custosemimposto,
                                p_id_aliquotacreditocusto,
                                p_piscofins,
                                p_id_tipopiscofins,
                                '',
                                p_customediocomimposto,
                                p_customediosemimposto,
                                p_valoripi,
                                p_valoricmssubstituicao,
                                null,
                                p_valorbasepiscofins, /*Custo Médio com imposto - alíquota + valoripi*/
                                p_valorpis,
                                p_valorcofins,
                                p_emitenota
                            );
                    END IF;
                END $$;`
    }

    try {
        await pgClient.query(query) 
        console.log(`{idLoja: ${idLoja}, idProduto: ${idProduto}, quantidade: ${quantidade}, idTipoConsumo: ${idTipoConsumo}},`)
    } catch (error) {
        console.error('Erro ao incluir consumo no banco de dados:', error);
        console.log(`{idLoja: ${idLoja}, idProduto: ${idProduto}, quantidade: ${quantidade}, idTipoConsumo: ${idTipoConsumo}},`)
    }
    
}