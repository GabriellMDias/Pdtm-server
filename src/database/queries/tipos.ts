import pgClient from "../db";
import { QueryConfig, QueryResult } from "pg";

type TipoEmbalagem = {
    id: number
    descricao: string
    descricaocompleta: string
}

type MotivoLancamento = {
    id: number
    descricao: string
}

export const getTipoEmbalagem = async () => {
    const queryTipoEmbalagem: QueryConfig = {
        text: `SELECT 
                id, 
                descricao, 
                descricaocompleta 
                FROM tipoembalagem`,
        name: 'getTipoEmbalagem'
    }
    const result: QueryResult<TipoEmbalagem> = await pgClient.query(queryTipoEmbalagem)
    return result
}

export const getTipoMotivoTroca = async () => {
    const queryTipoMotivoTroca: QueryConfig = {
        text: `SELECT 
                id, 
                descricao 
               FROM tipomotivotroca
               WHERE id_situacaocadastro = 1`,
        name: 'getTipoMotivoTroca'
    }
    const result: QueryResult<MotivoLancamento> = await pgClient.query(queryTipoMotivoTroca)
    return result
}

export const getTipoConsumo = async () => {
    const queryTipoConsumo: QueryConfig = {
        text: `SELECT 
                    id, 
                    descricao
                FROM tipoconsumo
                WHERE id_situacaocadastro = 1`,
        name: 'getTipoConsumo'
    }
    const result: QueryResult<MotivoLancamento> = await pgClient.query(queryTipoConsumo)
    return result
}

export const getTipoMotivoQuebra = async () => {
    const queryTipoQuebra: QueryConfig = {
        text: `SELECT 
                    id, 
                    descricao
                FROM tipomotivoquebra
                WHERE id_situacaocadastro = 1`,
        name: 'getTipoMotivoQuebra'
    }
    const result: QueryResult<MotivoLancamento> = await pgClient.query(queryTipoQuebra)
    return result
}

export const getTipoMotivoPerda = async () => {
    const queryTipoPerda: QueryConfig = {
        text: `SELECT 
                    id, 
                    descricao
                FROM tipomotivoperda
                WHERE id_situacaocadastro = 1`,
        name: 'getTipoMotivoPerda'
    }
    const result: QueryResult<MotivoLancamento> = await pgClient.query(queryTipoPerda)
    return result
}