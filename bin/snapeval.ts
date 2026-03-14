#!/usr/bin/env tsx
import { Command } from 'commander';

const program = new Command();

program
  .name('snapeval')
  .description('Semantic snapshot testing for AI skills')
  .version('0.1.0');

program.parse(process.argv);
