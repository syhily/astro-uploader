import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['./src/index.ts'],
  clean: true,
  tsconfig: './tsconfig.json',
  sourcemap: false,
  format: ['esm', 'cjs'],
  dts: true,
})
