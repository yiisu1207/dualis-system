/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"  // 👈 Ahora sí todo está aquí dentro
  ],
  // darkMode eliminado: solo modo claro
  theme: {
    extend: {
      colors: {
        // 👇 ESTA LÍNEA ES LA MAGIA: Crea un color llamado 'primary' que cambia solo
        primary: 'var(--odoo-primary)', 
      }
    },
  },
  plugins: [],
}