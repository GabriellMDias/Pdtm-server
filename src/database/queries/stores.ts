import pgClient from "../db";
import { QueryConfig, QueryResult } from "pg";

type Store = {
    id: number
    descricao: string
}

const query: QueryConfig = {
    text: `SELECT 
            id, 
            descricao 
            FROM loja`,
    name: 'getStores'
}

export const getStores = async () => {
    const result: QueryResult<Store> = await pgClient.query(query)
    return result
}