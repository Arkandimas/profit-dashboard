import { getAuthUrl } from '@/lib/shopee'

export async function GET(request: Request) {
  const origin = new URL(request.url).origin
  const redirectUrl = `${origin}/api/shopee/callback`
  const authUrl = getAuthUrl(redirectUrl)
  return Response.redirect(authUrl, 302)
}
