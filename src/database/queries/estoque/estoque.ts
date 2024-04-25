import pgClient from "../../db";
import { QueryConfig, QueryResult } from "pg";
import { getAssociatedStockProductInfo, getProductParams, AssociatedStockProduct } from "../products";

type InsertStockFrozenParams = {
    idStore: number,
    idProduct: number,
    idMovementType: number,
    quantity: number,
    idInOrOut: number
}

type UpdateStock = {
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

type GenerateStockMovementParams = {
    idStore: number,
    idProduct: number,
    idUser: number,
    idMovementType: number,
    quantity: number,
    idInOrOut: number,
    custocomimpostototalentrada?: number
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

    const result: QueryResult<{valor: boolean}> = await pgClient.query(query)

    return result.rows[0].valor
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
        console.error('Erro ao inserir em estoquecongelado no banco de dados:', error);
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
        console.error('Erro ao inserir em logestoque no banco de dados:', error);
    }
}

export const generateStockMovement = async (params: GenerateStockMovementParams) => {
    // Verifica se o Estoque está congelado
    const isStockFrozenStatus = await isStockFrozen(params.idStore)
    // Verifica se o produto é associado
    const associatedStockProductInfo = await getAssociatedStockProductInfo(params.idProduct)
    const isAssociated = associatedStockProductInfo != undefined ? true : false

    const productParams = await getProductParams(isAssociated ? associatedStockProductInfo.id_produto_ass : params.idProduct, params.idStore)
    
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
        custosemimposto: Number(productParams.custosemimposto),
        custocomimposto: Number(productParams.custocomimposto),
        customediosemimposto: Number(productParams.customediosemimposto),
        customediocomimposto: Number(productParams.customediocomimposto)
    }
    console.log(params.custocomimpostototalentrada)
    // Se estiver congelado, insere na tabela estoquecongelado
    if(isStockFrozenStatus){
        await insertStockFrozen({
            idStore: insertLogStockParams.idStore,
            idProduct: insertLogStockParams.idProduct,
            quantity: insertLogStockParams.quantity,
            idMovementType: insertLogStockParams.idMovementType,
            idInOrOut: insertLogStockParams.idInOrOut
        })
    } else { // Se não estiver congelado, insere na tabela logestoque e atualiza o estoque
        await updateStock(insertLogStockParams)
    }
}