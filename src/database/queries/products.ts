import pgClient from "../db";
import { QueryConfig, QueryResult } from "pg";

type Produto = {
    id: number
    codigobarras: number
    qtdembalagem: number
    decimal: boolean
    id_tipoembalagem: number
    descricaocompleta: string
    pesobruto: number
    permitequebra: boolean
    permiteperda: boolean
    precovenda: number
    estoque: number
    troca: number
    customediocomimposto: number
    fabricacaopropria: boolean 
}

export type AssociatedStockProduct = {
    qtdembalagem_pri: number,
    id_produto_ass: number,
    qtdembalagem_ass: number,
    percentualcustoestoque_ass: number
}

type ProductParams = {
    id_situacaocadastro: number,
    custosemimposto: number,
    custocomimposto: number,
    customediosemimposto: number,
    customediocomimposto: number,
    estoque: number,
    id_aliquotacreditocusto: number,
    piscofins: number,
    id_tipopiscofins: number,
    valoripi: number,
    valoricmssubstituicao: number,
    valorbasepiscofins: number,
    valorpis: number,
    valorcofins: number
}

export const getProducts = async (idStore: number) => {
    const query: QueryConfig = {
        text: `SELECT 
                    p.id,
                    pa.codigobarras,
                    pa.qtdembalagem,
                    CASE 
                        WHEN p.id_tipoembalagem IN (4, 6, 9) THEN true
                        ELSE false
                    END as decimal,
                    pa.id_tipoembalagem,
                    p.descricaocompleta,
                    p.pesobruto,
                    p.permitequebra,
                    p.permiteperda,
                    pc.precovenda,
                    pc.estoque,
                    pc.troca,
                    pc.customediocomimposto,
                    pc.fabricacaopropria
                FROM produto p 
                JOIN produtocomplemento pc ON pc.id_produto = p.id
                JOIN produtoautomacao pa ON pa.id_produto = p.id
                WHERE pc.id_situacaocadastro = 1
                AND pc.id_loja = $1
                ORDER BY p.id`,
        values: [idStore]
    }

    try {
        const result: QueryResult<Produto> = await pgClient.query(query)
        return result
    } catch (error) {
        throw error
    }
    
}

export const getAssociatedStockProductInfo = async (idProduct: number) => {
    const query: QueryConfig = {
        text: `SELECT 
                    ass.qtdembalagem as qtdembalagem_pri,
                    ai.id_produto as id_produto_ass,
                    ai.qtdembalagem as qtdembalagem_ass,
                    ai.percentualcustoestoque as percentualcustoestoque_ass
                FROM associadoitem ai
                JOIN associado ass ON ass.id = ai.id_associado
                WHERE ai.aplicaestoque = 't'
                AND ass.id_produto = $1`,
        values: [idProduct],
    }

    try {
        const result: QueryResult<AssociatedStockProduct> = await pgClient.query(query)
        return result.rows[0]
    } catch (error) {
        throw error
    }
}

export const getProductParams = async (idProduct: number, idStore: number) => {
    const query: QueryConfig = {
        text: `SELECT 
                    pc.id_situacaocadastro,
                    pc.custosemimposto,
                    pc.custocomimposto,
                    pc.customediosemimposto,
                    pc.customediocomimposto,
                    pc.estoque,
                    pa.id_aliquotacreditocusto, 
                    (tpc.valorpis + tpc.valorcofins)::numeric(11,2) as piscofins,
                    p.id_tipopiscofinscredito as id_tipopiscofins,
                    pc.valoripi as valoripi,
                    pc.valoricmssubstituicao as valoricmssubstituicao,
                    (pc.customediocomimposto - 
                    ((pc.customediocomimposto * a.porcentagemfinal)/100)
                    + pc.valoripi)::numeric(11,4) as valorbasepiscofins,
                    ((tpc.valorpis * (pc.customediocomimposto - 
                    ((pc.customediocomimposto * a.porcentagemfinal)/100)
                    + pc.valoripi))/100)::numeric(11,4) as valorpis,
                    ((tpc.valorcofins * (pc.customediocomimposto - 
                    ((pc.customediocomimposto * a.porcentagemfinal)/100)
                    + pc.valoripi))/100)::numeric(11,4) as valorcofins
                FROM produto p 
                JOIN tipopiscofins tpc ON tpc.id = p.id_tipopiscofinscredito 
                JOIN produtoaliquota pa ON pa.id_produto = p.id
                JOIN aliquota a ON a.id = pa.id_aliquotacreditocusto 
                JOIN produtocomplemento pc ON pc.id_produto = p.id
                WHERE p.id = $1
                AND pc.id_loja = $2;`,
        values: [idProduct, idStore],
    }

    try {
        const result: QueryResult<ProductParams> = await pgClient.query(query)
        return result.rows[0]
    } catch (error) {
        throw error
    }
    
}

export const isProductActive = async (idProduct:number, idStore: number) => {
    const query: QueryConfig<number[]> = {
        text: `SELECT 
                	id_situacaocadastro::boolean
                FROM produtocomplemento pc
                WHERE id_produto = $1
                AND id_loja = $2
                LIMIT 1`,
        values: [idProduct, idStore],
    }

    try {
        const result: QueryResult<{id_situacaocadastro: boolean}> = await pgClient.query(query)
        return result.rows[0].id_situacaocadastro
    } catch (error) {
        throw error
    }
}