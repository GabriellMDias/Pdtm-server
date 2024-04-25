import { Client } from 'pg'
import dotenv from "dotenv";

dotenv.config();
 
const pgClient = new Client({
  host: process.env.PG_DATABASE_HOST,
  port: parseInt(process.env.PG_DATABASE_PORT ?? "8745"),
  database: process.env.PG_DATABASE_NAME,
  user: process.env.PG_DATABASE_USER,
  password: process.env.PG_DATABASE_PASSWORD,
  application_name: 'pdtm-mobile'
})

pgClient.connect()
  .then(() => console.log('Connected to the database'))
  .catch(err => console.error('Error connecting to the database', err));

export default pgClient