import { test, expect } from '@playwright/test';

test.describe('public buttons', () => {
  test('landing CTA buttons navigate', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /Comenzar Gratis/i }).click();
    await expect(page).toHaveURL(/\/register/);

    await page.goto('/');
    await page.getByRole('button', { name: /Iniciar/i }).first().click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('landing module buttons are clickable', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Finanzas' }).click();
    await expect(page.locator('#finanzas')).toBeVisible();
  });

  test('login buttons open picker and return home', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /Elija un usuario/i }).click();
    await expect(page.getByRole('heading', { name: /Usuarios recientes/i })).toBeVisible();

    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
  });

  test('register footer link navigates to login', async ({ page }) => {
    await page.goto('/register');
    await page.getByRole('button', { name: /Ya tienes un espacio/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
