import express, { Request, Response, Router } from "express";
const router: Router = express.Router();
import { getProducts } from "../database/queries/products";
import { getStores } from "../database/queries/stores";
import { getTipoEmbalagem, getTipoMotivoTroca, getTipoConsumo, getTipoMotivoQuebra, getTipoMotivoPerda } from "../database/queries/tipos";
import { getRecipes } from "../database/queries/estoque/producao";

router.post(
  "/products",
  async (req: Request, res: Response) => {
    const {idLoja} = req.body

    const result = await getProducts(idLoja)
    res.send(result.rows)
  }
);

router.post(
  "/recipes",
  async (req: Request, res: Response) => {
    const {idLoja} = req.body

    const result = await getRecipes(idLoja)
    res.send(result.rows)
  }
);

router.get(
  "/stores",
  async (req: Request, res: Response) => {
    const result = await getStores()
    res.send(result.rows)
  }
);

router.get(
  "/tipoembalagem",
  async (req: Request, res: Response) => {
    const result = await getTipoEmbalagem()
    res.send(result.rows)
  }
);

router.get(
  "/tipomotivotroca",
  async (req: Request, res: Response) => {
    const result = await getTipoMotivoTroca()
    res.send(result.rows)
  }
);

router.get(
  "/tipoconsumo",
  async (req: Request, res: Response) => {
    const result = await getTipoConsumo()
    res.send(result.rows)
  }
);

router.get(
  "/tipomotivoquebra",
  async (req: Request, res: Response) => {
    const result = await getTipoMotivoQuebra()
    res.send(result.rows)
  }
);

router.get(
  "/tipomotivoperda",
  async (req: Request, res: Response) => {
    const result = await getTipoMotivoPerda()
    res.send(result.rows)
  }
);

export default router;