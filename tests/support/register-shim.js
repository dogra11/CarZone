/**
 * tests/support/register-shim.js - TEST-ONLY. Loaded with `node --import` so that
 *   import mysql from 'mysql2/promise'  -> SQLite-backed shim (no MySQL server needed)
 *   import express from 'express'       -> Express 4 test shim (no npm install needed)
 * Usage:  node --import ./tests/support/register-shim.js --test
 * The shipped application always imports the real mysql2 and express packages.
 */
import { register } from 'node:module';

register('./shim-loader.js', import.meta.url);
