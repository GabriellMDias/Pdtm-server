import pgClient from "../db";
import { QueryConfig } from "pg";
import { getVRVersion } from "./utils";

type LogTransacaoQueryParams = {
    idStore: number, 
    idProduct: number, 
    idForm: number,
    idTransactionType: number,
    idUser: number,
    ipTerminal: string
}

export const insertLogTransacao = async (params: LogTransacaoQueryParams) => {
    const VRVersion = await getVRVersion()

    const query: QueryConfig = {
        text: `INSERT INTO logtransacao
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
                    $1,
                    $2,
                    $3,
                    $4,
                    '',
                    to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')::timestamp,
                    $5,
                    NOW()::date,
                    '/' || $6,
                    $7,
                    $8,
                    ''
                );`,
                values: [params.idStore, 
                        params.idProduct, 
                        params.idForm, 
                        params.idTransactionType, 
                        params.idUser, 
                        params.ipTerminal, 
                        VRVersion,
                        params.idProduct]
    }

    try {
        await pgClient.query(query)
    } catch (error) {
        console.error('Erro ao incluir logTransacao no banco de dados:', error);
    }
}