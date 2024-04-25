import express, { Request, Response, Router } from "express";
const router: Router = express.Router();
import { lancamentoTroca, TrocaProps } from "../database/queries/estoque/troca";
import { ConsumoProps, lancamentoConsumo } from "../database/queries/estoque/consumo";
import { lancamentoProducao, ProducaoProps } from "../database/queries/estoque/producao";

router.post(
  "/lancamentotroca",
  async (req: Request, res: Response) => {
    const data: TrocaProps[] = req.body;

    console.log('Transmitindo Troca...')
    try {
      for (const item of data) {
        await lancamentoTroca(item);
      }
    } catch (error) {
      console.error('Erro ao lançar troca:', error);
      res.status(500).send('Erro ao lançar troca');
    } finally {
      res.status(200).send('Troca Transmitida: ' + JSON.stringify(data))
    }
  }
);

router.post(
  "/lancamentoconsumo",
  async (req: Request, res: Response) => {
    const data: ConsumoProps[] = req.body;

    console.log('Transmitindo Consumo...')
    try {
      for (const item of data) {
        await lancamentoConsumo(item);
      }
    } catch (error) {
      console.error('Erro ao lançar consumo:', error);
      res.status(500).send('Erro ao lançar consumo');
    } finally {
      res.status(200).send('Consumo Transmitido: ' + JSON.stringify(data))
    }
  }
);

router.post("/lancamentoproducao",
  async (req: Request, res: Response) => {
    const data: ProducaoProps[] = req.body;

    console.log('Transmitindo Produção...')
    try {
      for (const item of data) {
        await lancamentoProducao(item);
      }
    } catch (error) {
      console.error('Erro ao lançar produção:', error);
      res.status(500).send('Erro ao lançar produção');
    } finally {
      res.status(200).send('Produção Transmitida: ' + JSON.stringify(data))
    }
  }
)

export default router