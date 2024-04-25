import pgClient from "../db";
import { QueryConfig, QueryResult } from "pg";

export const getVRVersion = async () => {
    const query: QueryConfig = {
        text: `SELECT 
                    versao
                FROM versao 
                WHERE id_programa = 0;`,
    }

    const result: QueryResult<{versao: string}> = await pgClient.query(query)

    return result.rows[0].versao
}