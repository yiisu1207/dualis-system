import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss'; // 👈 Importamos el pintor
import autoprefixer from 'autoprefixer'; // 👈 Importamos el asistente

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 6000,
        host: '0.0.0.0',
        historyApiFallback: true,
      },
      plugins: [react()],
      
      // 👇 ESTA ES LA PARTE QUE TE FALTABA PARA QUE VUELVAN LOS COLORES
      css: {
        postcss: {
          plugins: [
            tailwindcss,
            autoprefixer,
          ],
        },
      },
      // 👆 FIN DE LA MAGIA

      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'), // 👈 Agregamos ./src
        }
      }
    };
});