import { QueryConfig } from "pg"
import { logger } from "../../../lib/logger"
import pgClient from "../../db"

export type RupturaItemsProps = {
    idLoja: number
    prateleita: string
    ipTerminal: string
    idUser: number
    idProdutos: number[]
}

export const lancamentoRuptura = async (rupturaItem: RupturaItemsProps[]) => {
    try {
        const dataAtual = new Date()
        const query: QueryConfig = {
            text: `INSERT INTO rupturacoletor (prateleira, id_produto, data, id_loja)
                        VALUES ${rupturaItem.map((ritem) => {
                            return ritem.idProdutos.map((produto) => {
                               return `('${ritem.prateleita}', ${produto}, '${dataAtual.getFullYear()}-${dataAtual.getMonth() + 1}-${dataAtual.getDate()}', ${ritem.idLoja})` 
                            })
                        })}`
        }

        await pgClient.query(query)

        return true
    } catch (error) {
        logger.error('Erro ao processar lançamento do balanço:', error,);
        await pgClient.query('ROLLBACK')
        return false
    }
}