import pgClient from "../../db";
import { QueryConfig } from "pg";
import { getProductParams } from "../products";
import { generateStockMovement } from "./estoque";
import { insertLogTransacao } from "../logTransacao";
import { logger } from "../../../lib/logger";

export type TrocaProps = {
    idLoja: number, 
    idProduto: number, 
    quantidade: number, 
    idTipoTroca: number, 
    ipTerminal: string,
    idUser: number
}

const insertTroca = async (trocaProps: TrocaProps) => {
    try {
        const productParams = await getProductParams(trocaProps.idProduto, trocaProps.idLoja)
    
        const query: QueryConfig = {
        text: `
                DO $$
                    DECLARE
                        p_trocaanterior numeric(18,3);
                    BEGIN
                        /* Verifica estoque anterior da troca */
                        SELECT 
                            troca
                        INTO
                            p_trocaanterior
                        FROM produtocomplemento 
                        WHERE id_produto = ${trocaProps.idProduto}
                        AND id_loja = ${trocaProps.idLoja};

                        /*Insere na tabela logtroca*/
		                INSERT INTO logtroca
		                (
		                	id_loja,
		                	id_produto,
		                	quantidade,
		                	datahora,
		                	id_usuario,
		                	estoqueanterior,
		                	estoqueatual,
		                	id_tipoentradasaida,
		                	datamovimento,
		                	id_motivotroca,
		                	observacaotroca,
		                	custosemimposto,
		                	custocomimposto,
		                	customediosemimposto,
		                	customediocomimposto
		                )
		                VALUES
		                (
		                	${trocaProps.idLoja}, 
		                	${trocaProps.idProduto}, 
		                	${trocaProps.quantidade}, 
		                	to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')::timestamp, 
		                	${trocaProps.idUser}, /*Usuário COLETORM*/
		                	p_trocaanterior,
		                	p_trocaanterior + ${trocaProps.quantidade},
		                	0, /*Entrada no estoque da troca*/
		                	NOW()::date,
		                	${trocaProps.idTipoTroca},
		                	'',
		                	${productParams.custosemimposto},
		                	${productParams.custocomimposto},
		                	${productParams.customediosemimposto},
		                	${productParams.customediocomimposto}
		                );

                        /*Adiciona no estoque da troca*/
		                UPDATE produtocomplemento
		                SET troca = p_trocaanterior + ${trocaProps.quantidade}
		                WHERE id_loja = ${trocaProps.idLoja}
		                AND id_produto = ${trocaProps.idProduto};
                    END;
                $$;
        `
        }

        if(productParams.id_situacaocadastro === 0) {
            throw new Error(`Código ${trocaProps.idProduto} excluído.`);
        }

        await pgClient.query(query) 
    } catch (error) {
        throw error
    }
}

export const lancamentoTroca = async (trocaProps: TrocaProps) => {
    const generateStockData = {
        idInOrOut: 1, 
        idMovementType: 18, 
        idProduct: trocaProps.idProduto, 
        idStore: trocaProps.idLoja, 
        idUser: trocaProps.idUser, 
        quantity: trocaProps.quantidade
    } 
    const logTransacaoData = {
        idStore: trocaProps.idLoja, 
        idProduct: trocaProps.idProduto, 
        idForm: 196,
        idTransactionType: 1,
        idUser: trocaProps.idUser,
        ipTerminal: trocaProps.ipTerminal
    }


    

    try {
        await pgClient.query('BEGIN')

        await generateStockMovement(generateStockData)
        await insertLogTransacao(logTransacaoData)
        await insertTroca(trocaProps)

        await pgClient.query('COMMIT')
        return true
    } catch (error) {
        logger.error('Erro ao processar lançamento da troca:', error, '\nDado não transmitido: ', JSON.stringify(trocaProps));
        await pgClient.query('ROLLBACK')
        return false
    }
}


export const lancamentoTrocaWithQuery = async (idLoja: number, idProduto: number, quantidade: number, idMotivoTroca: number, ipTerminal: string) => {
    const query: QueryConfig = {
        text: `DO $$
                DECLARE 
                    p_id_loja integer;
                    p_id_produto integer;
                    p_quantidade numeric(12,3);
                    p_custocomimposto numeric(13,4);
                    p_custosemimposto numeric(13,4);
                    p_customediocomimposto numeric(13,4);
                    p_customediosemimposto numeric(13,4);
                    p_estoqueanterior numeric(18,3);
                    p_trocaanterior numeric(18,3);
                    p_id_motivotroca integer;
                    p_ipterminal VARCHAR(80);
                    p_versao VARCHAR(50);
                    p_statuscongelamento boolean;
                    p_qtdembalagem_pri integer;
                    p_id_produto_ass integer;
                    p_qtdembalagem_ass integer;
                    p_percentualcustoestoque_ass numeric(19,4);
                BEGIN
                    /*Definição dos parâmetros*/
                    p_id_loja:= ${idLoja};
                    p_id_produto:= ${idProduto};
                    p_quantidade:= ${quantidade};
                    p_id_motivotroca:= ${idMotivoTroca};
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
                    /*Estoque da troca deve ser o do produto principal mesmo se tiver associado*/
                    SELECT 
                        troca
                    INTO
                        p_trocaanterior
                    FROM produtocomplemento 
                    WHERE id_produto = p_id_produto
                    AND id_loja = p_id_loja;
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
                            18, /*Tipo Movimentação Entrada Troca*/
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
                            18,
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
                    
                    /*Insere na tabela logtroca*/
                        INSERT INTO logtroca
                        (
                            id_loja,
                            id_produto,
                            quantidade,
                            datahora,
                            id_usuario,
                            estoqueanterior,
                            estoqueatual,
                            id_tipoentradasaida,
                            datamovimento,
                            id_motivotroca,
                            observacaotroca,
                            custosemimposto,
                            custocomimposto,
                            customediosemimposto,
                            customediocomimposto
                        )
                        VALUES
                        (
                            p_id_loja, 
                            p_id_produto, 
                            p_quantidade, 
                            to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')::timestamp, 
                            66, /*Usuário COLETORM*/
                            p_trocaanterior,
                            p_trocaanterior + p_quantidade,
                            0, /*Entrada no estoque da troca*/
                            NOW()::date,
                            p_id_motivotroca,
                            '',
                            p_custosemimposto,
                            p_custocomimposto,
                            p_customediosemimposto,
                            p_customediocomimposto
                        );
                
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
                            196, /*Estoque Troca*/
                            1, /*ALTERAÇÃO*/
                            'ALTERA ESTOQUE',
                            to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')::timestamp,
                            66, /*Usuário COLETORM*/
                            NOW()::date,
                            '/' || p_ipterminal,
                            p_versao,
                            0,
                            ''
                        );
                
                        /*Adiciona no estoque da troca*/
                        UPDATE produtocomplemento
                        SET troca = p_trocaanterior + p_quantidade
                        WHERE id_loja = p_id_loja
                        AND id_produto = p_id_produto;
                END $$;`
    }

    try {
        await pgClient.query(query) 
        console.log(`{idLoja: ${idLoja}, idProduto: ${idProduto}, quantidade: ${quantidade}, idMotivoTroca: ${idMotivoTroca}},`)
    } catch (error) {
        console.error('Erro ao incluir troca no banco de dados:', error);
        console.log(`{idLoja: ${idLoja}, idProduto: ${idProduto}, quantidade: ${quantidade}, idMotivoTroca: ${idMotivoTroca}},`)
    }
    
}