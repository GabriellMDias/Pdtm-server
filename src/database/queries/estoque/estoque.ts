import pgClient from "../../db";
import { QueryConfig, QueryResult } from "pg";
import { getAssociatedStockProductInfo, getProductParams, AssociatedStockProduct } from "../products";
import { logger } from "../../../lib/logger";

export type InsertStockFrozenParams = {
    idStore: number,
    idProduct: number,
    idMovementType: number,
    quantity: number,
    idInOrOut: number
}

export type UpdateStock = {
    idStore: number,
    idProduct: number,
    quantity: number,
    idMovementType: number,
    idUser: number,
    stock: number,
    idInOrOut: number,
    custosemimposto: number,
    custocomimposto: number,
    customediosemimposto: number,
    customediocomimposto: number
}

export type Costs = {
    custosemimposto: number,
    custocomimposto: number
}

export interface UpdateCost extends Costs {
    idStore: number
    idProduct: number
    idUser: number
    customediocomimposto: number
    customediosemimposto: number
    custosemimpostoanterior: number
    custocomimpostoanterior: number
    customediosemimpostoanterior: number
    customediocomimpostoanterior: number
    observacao: string
}

export type GenerateStockMovementParams = {
    idStore: number,
    idProduct: number,
    idUser: number,
    idMovementType: number,
    quantity: number,
    idInOrOut: number,
    updateCost: boolean,
    costs?: Costs
}

const isStockFrozen = async (idStore: number) => {
    const query: QueryConfig = {
        text: `SELECT 
                    valor::boolean
                FROM 
                parametrovalor pv 
                JOIN parametro p ON p.id = pv.id_parametro
                WHERE p.descricao = 'Estoque Congelado'
                AND id_loja = $1;`,
        values: [idStore]
    }

    try {
        const result: QueryResult<{valor: boolean}> = await pgClient.query(query)
        return result.rows[0].valor
    } catch (error) {
        throw error
    }
}

const calcAssociatedQuantity = (params: AssociatedStockProduct, quantity: number) => {
    const associtedQuantity = (quantity*(params.qtdembalagem_pri/params.qtdembalagem_ass)) + 
                              ((params.percentualcustoestoque_ass/100)*quantity*
                              (params.qtdembalagem_pri/params.qtdembalagem_ass))
    return associtedQuantity
}

const insertStockFrozen = async (params: InsertStockFrozenParams) => {
    const query: QueryConfig = {
        text: `INSERT INTO estoquecongelado 
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
                    $1, 
                    $2, 
                    $3,
                    $4, 
                    false, 
                    true, 
                    false, 
                    '', 
                    0.0000, 
                    0.0000, 
                    0.0000, 
                    0.0000, 
                    NOW()::date, 
                    $5, 
                    null
                );`,
                values: [
                    params.idProduct,
                    params.idStore,
                    params.idMovementType,
                    params.quantity,
                    params.idInOrOut
                ]
    }  

    try {
        await pgClient.query(query)
    } catch (error) {
        throw error
    }
}

const updateStock = async (params: UpdateStock) => {
    const insertQuery: QueryConfig = {
        text: `INSERT INTO logestoque
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
                    $1,
                    $2,
                    $3,
                    $4,
                    to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')::timestamp,
                    $5,
                    '',
                    $6,
                    $7,
                    $8,
                    $9,
                    $10,
                    NOW()::date,
                    $11,
                    $12,
                    null
                );
                `,
                values: [
                    params.idStore,
                    params.idProduct,
                    params.quantity,
                    params.idMovementType,
                    params.idUser,
                    params.stock,
                    params.idInOrOut === 1 ? params.stock - params.quantity : params.stock + params.quantity,
                    params.idInOrOut,
                    params.custosemimposto,
                    params.custocomimposto,
                    params.customediocomimposto,
                    params.customediosemimposto
                ]
    }

    const updateQuery: QueryConfig = {
        text:`UPDATE produtocomplemento
        SET estoque = $1
        WHERE id_loja = $2
        AND id_produto = $3;
        `,
        values: [
            params.idInOrOut === 1 ? params.stock - params.quantity : params.stock + params.quantity,
            params.idStore,
            params.idProduct
        ]
    }

    try {
        await pgClient.query(insertQuery)
        await pgClient.query(updateQuery)
    } catch (error) {
        throw error
    }
}

const calculateAvgCost = (actualStock: number, actualAvgCost: number, quantityToEnter: number, costToEnter: number) => {
    if (actualStock <= 0) {
        return costToEnter
    } else {
        return Number((((actualStock * actualAvgCost) + (quantityToEnter * (costToEnter ?? 0))) / (actualStock + quantityToEnter)).toFixed(3));
    }
}

const updateCost = async (params: UpdateCost) => {
    const insertQuery: QueryConfig = {
        text: `
                INSERT INTO logcusto
                (id_produto, custosemimpostoanterior, custosemimposto, custocomimpostoanterior, custocomimposto, datahora, id_usuario, id_loja, datamovimento, observacao, customediosemimposto, customediocomimposto, customediocomimpostoanterior, customediosemimpostoanterior, valoripi, valoricmssubstituicao, valoricms, valorpiscofins, valoracrescimo, valoracrescimoimposto, custonota, percentualperda, valordesconto, valordescontoimposto, valorbonificacao, valorverba, valoroutrassubstituicao, valordespesafrete, valorfcp, valorfcpsubstituicao)
                VALUES($1, $2, $3, $4, $5, to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')::timestamp, $6, $7, NOW()::date, $8, $9, $10, $11, $12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
            `,
        values: [params.idProduct, 
                params.customediosemimpostoanterior, 
                params.custosemimposto,
                params.custocomimpostoanterior,
                params.custocomimposto,
                params.idUser,
                params.idStore,
                params.observacao,
                params.customediosemimposto,
                params.customediocomimposto,
                params.customediocomimpostoanterior,
                params.customediosemimpostoanterior
            ]
    }

    const updateQuery: QueryConfig = {
        text: `
            update produtocomplemento
            set custosemimposto = $1, custocomimposto = $2, custosemimpostoanterior = $3, custocomimpostoanterior = $4, customediocomimposto = $5, customediosemimposto = $6, customediocomimpostoanterior = $7, customediosemimpostoanterior = $8
            where id_loja = $9
            AND id_produto = $10
        `,
        values: [
                    params.custosemimposto, 
                    params.custocomimposto, 
                    params.custosemimpostoanterior,
                    params.custocomimpostoanterior,
                    params.customediocomimposto,
                    params.customediosemimposto,
                    params.customediocomimpostoanterior,
                    params.customediosemimpostoanterior,
                    params.idStore,
                    params.idProduct
                ]
    }

    try {
        await pgClient.query(insertQuery)
        await pgClient.query(updateQuery)
    } catch (error) {
        throw error
    }
}

export const generateStockMovement = async (params: GenerateStockMovementParams) => {
    try {
        // Verifica se o Estoque está congelado
    const isStockFrozenStatus = await isStockFrozen(params.idStore)
    // Verifica se o produto é associado
    const associatedStockProductInfo = await getAssociatedStockProductInfo(params.idProduct)
    const isAssociated = associatedStockProductInfo != undefined ? true : false

    const productParams = await getProductParams(isAssociated ? associatedStockProductInfo.id_produto_ass : params.idProduct, params.idStore)

    const novoCustoMedioSemImposto = calculateAvgCost(productParams.estoque, productParams.customediosemimposto, params.quantity, params.costs?.custosemimposto ?? 0)
    const novoCustoMedioComImposto = calculateAvgCost(productParams.estoque, productParams.customediocomimposto, params.quantity, params.costs?.custocomimposto ?? 0)

    const insertLogStockParams: UpdateStock = {
        idStore: params.idStore,
        idProduct: isAssociated ? 
                    associatedStockProductInfo.id_produto_ass :
                    params.idProduct,
        quantity: isAssociated ? 
                    calcAssociatedQuantity(associatedStockProductInfo, params.quantity):
                    params.quantity,
        idMovementType: params.idMovementType,
        idUser: params.idUser,
        stock: Number(productParams.estoque),
        idInOrOut: params.idInOrOut,
        custosemimposto: params.updateCost ? (params.costs?.custosemimposto ?? 0) : Number(productParams.custosemimposto),
        custocomimposto: params.updateCost ? (params.costs?.custocomimposto ?? 0) : Number(productParams.custocomimposto),
        customediosemimposto: params.updateCost ? novoCustoMedioSemImposto : Number(productParams.customediosemimposto),
        customediocomimposto: params.updateCost ? novoCustoMedioComImposto : Number(productParams.customediocomimposto)
    }

    if(params.updateCost) {
        await updateCost({
            idStore: params.idStore,
            custosemimposto: params.costs?.custosemimposto ?? 0,
            custocomimposto: params.costs?.custocomimposto ?? 0,
            customediosemimposto: novoCustoMedioSemImposto,
            customediocomimposto: novoCustoMedioComImposto,
            idProduct: params.idProduct,
            idUser: params.idUser,
            custosemimpostoanterior: productParams.custosemimposto,
            custocomimpostoanterior: productParams.custocomimposto,
            customediosemimpostoanterior: productParams.customediosemimposto,
            customediocomimpostoanterior: productParams.customediocomimposto,
            observacao: 'PRODUCAO 0'
        })
    }

        // Se estiver congelado, insere na tabela estoquecongelado
        if(isStockFrozenStatus && productParams.id_situacaocadastro === 1){
            await insertStockFrozen({
                idStore: insertLogStockParams.idStore,
                idProduct: insertLogStockParams.idProduct,
                quantity: insertLogStockParams.quantity,
                idMovementType: insertLogStockParams.idMovementType,
                idInOrOut: insertLogStockParams.idInOrOut
            })
        } else if (productParams.id_situacaocadastro === 1){ // Se não estiver congelado, insere na tabela logestoque e atualiza o estoque
            await updateStock(insertLogStockParams)
        }
    } catch (error) {
        throw error
    }
    
}