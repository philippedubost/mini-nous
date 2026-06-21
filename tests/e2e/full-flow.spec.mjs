import { test, expect } from '@playwright/test'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admininous'

async function fillStripeCheckout(page) {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 })

  const cardFrame = page.frameLocator('iframe').first()
  await cardFrame.locator('[name="cardnumber"], [placeholder*="1234"]').first().fill('4242424242424242')
  await cardFrame.locator('[name="exp-date"], [placeholder*="MM"]').first().fill('0827')
  await cardFrame.locator('[name="cvc"], [placeholder*="CVC"]').first().fill('123')

  const payButton = page.getByRole('button', { name: /payer|pay/i })
  await payButton.click()
}

test('parcours complet test-flow jusqu\'à expédié', async ({ page }) => {
  await page.goto('/pipeline/test')

  await page.getByPlaceholder('Mot de passe admin').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Accéder' }).click()

  await expect(page.getByRole('button', { name: /Lancer le test complet/ })).toBeVisible()

  await page.getByRole('button', { name: /Lancer le test complet/ }).click()

  await fillStripeCheckout(page)

  await page.waitForURL(/\/pipeline\/test\?.*session_id=/, { timeout: 90_000 })

  await expect(page.getByText(/Parcours terminé/)).toBeVisible({ timeout: 120_000 })
  await expect(page.getByText(/Expédié/i)).toBeVisible()
})
