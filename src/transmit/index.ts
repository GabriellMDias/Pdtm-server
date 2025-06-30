import express, { Request, Response, Router } from "express";
const router: Router = express.Router();
import { lancamentoTroca, TrocaProps } from "../database/queries/estoque/troca";
import { ConsumoProps, lancamentoConsumo } from "../database/queries/estoque/consumo";
import { lancamentoProducao, ProducaoProps } from "../database/queries/estoque/producao";
import { logger } from "../lib/logger";
import { BalancoItemProps, lancamentoBalanco } from "../database/queries/estoque/balanco";
import { lancamentoRuptura, RupturaItemsProps } from "../database/queries/administrativo/ruptura";

router.post(
  "/lancamentotroca",
  async (req: Request, res: Response) => {
    const data: TrocaProps[] = req.body;
    let dataSuccess: TrocaProps[] = []

    for (const item of data) {
      const result = await lancamentoTroca(item);
      
      if(result) {
        dataSuccess.push(item)
      }
    }

    if (dataSuccess.length > 0) {
      logger.transmissionLog(data[0].idLoja, 'TROCA', dataSuccess)
    }
    
    res.status(200).send(dataSuccess)
  }
);

router.post(
  "/lancamentoconsumo",
  async (req: Request, res: Response) => {
    const data: ConsumoProps[] = req.body;
    const dataSuccess: ConsumoProps[] = []

    for (const item of data) {
      const result = await lancamentoConsumo(item);
      
      if(result) {
        dataSuccess.push(item)
      }
    }

    if (dataSuccess.length > 0) {
      logger.transmissionLog(data[0].idLoja, 'CONSUMO', dataSuccess)
    }
    
    res.status(200).send(dataSuccess)
  }
);

router.post(
  "/lancamentoproducao",
  async (req: Request, res: Response) => {
    const data: ProducaoProps[] = req.body;
    const dataSuccess: ProducaoProps[] = []

    for (const item of data) {
      const result = await lancamentoProducao(item);
      
      if(result) {
        dataSuccess.push(item)
      }
    }

    if (dataSuccess.length > 0) {
      logger.transmissionLog(data[0].idLoja, 'PRODUÇÃO', dataSuccess)
    }
    
    res.status(200).send(dataSuccess)
  }
);

router.post(
  "/lancamentobalanco",
  async (req: Request, res: Response) => {
    const data: BalancoItemProps[] = req.body
    const dataSuccess: BalancoItemProps[] = []

    for (const item of data) {
      const result = await lancamentoBalanco(item)

      if(result) {
        dataSuccess.push(item)
      }
    }

    if (dataSuccess.length > 0) {
      logger.transmissionLog(data[0].idLoja, 'BALANÇO', dataSuccess)
    }

    res.status(200).send(dataSuccess)
  }
)

router.post("/lancamentoruptura",
  async (req: Request, res: Response) => {
    const data: RupturaItemsProps[] = req.body

    const result = await lancamentoRuptura(data)

    if(result) {
      logger.transmissionLog(data[0].idLoja, 'RUPTURA', data)
    }

    res.status(200).send(data)
  }
)

export default router