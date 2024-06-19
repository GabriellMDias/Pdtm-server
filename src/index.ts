import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import cors from 'cors'


import sincronizar from "./syncronize/index";
import transmit from "./transmit/index"

dotenv.config();

const app = express();
app.use(cors())
app.use(bodyParser.json());

const port = process.env.PORT;

app.get('/testconnection/:devicename', (req: Request, res: Response) => {
  const { devicename } = req.params
  res.status(200).send('pdtm-server')
});

app.use('/sync', sincronizar)

app.use('/transmit', transmit)

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});