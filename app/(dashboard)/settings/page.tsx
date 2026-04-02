'use client'

import { useState, useEffect, Suspense } from 'react'
import { useTheme } from 'next-themes'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Sun, Moon, Monitor, Check, Loader2, AlertCircle, Link2 } from 'lucide-react'

type ShopeeStatus = { state: 'loading' } | { state: 'connected'; shop_name: string } | { state: 'disconnected' } | { state: 'error'; message: string }

// Inner component that reads searchParams (must be inside Suspense)
function ShopeeConnectionCard() {
  const [shopeeStatus, setShopeeStatus] = useState<ShopeeStatus>({ state: 'loading' })
  const searchParams = useSearchParams()

  useEffect(() => {
    // Handle redirect params from OAuth callback
    const connected = searchParams.get('shopee_connected')
    const error = searchParams.get('shopee_error')

    if (connected === '1') {
      // Clear the URL param without a full reload
      window.history.replaceState({}, '', '/settings')
    }
    if (error) {
      setShopeeStatus({ state: 'error', message: decodeURIComponent(error) })
      window.history.replaceState({}, '', '/settings')
      return
    }

    fetch('/api/shopee/status')
      .then((r) => r.json())
      .then((data) => {
        if (data.connected) {
          setShopeeStatus({ state: 'connected', shop_name: data.shop_name ?? 'My Shopee Store' })
        } else {
          setShopeeStatus({ state: 'disconnected' })
        }
      })
      .catch(() => setShopeeStatus({ state: 'disconnected' }))
  }, [searchParams])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Connected Platforms</CardTitle>
        <CardDescription>Manage your e-commerce connections</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Shopee */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              S
            </div>
            <div>
              <p className="font-medium">Shopee</p>
              <p className="text-xs text-muted-foreground">
                {shopeeStatus.state === 'loading' && 'Checking connection…'}
                {shopeeStatus.state === 'connected' && `Connected as ${shopeeStatus.shop_name}`}
                {shopeeStatus.state === 'disconnected' && 'Not connected'}
                {shopeeStatus.state === 'error' && shopeeStatus.message}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {shopeeStatus.state === 'loading' && (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            )}
            {shopeeStatus.state === 'connected' && (
              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 gap-1">
                <Check className="w-3 h-3" /> Connected
              </Badge>
            )}
            {shopeeStatus.state === 'error' && (
              <Badge variant="destructive" className="gap-1">
                <AlertCircle className="w-3 h-3" /> Error
              </Badge>
            )}
            {(shopeeStatus.state === 'disconnected' || shopeeStatus.state === 'error') && (
              <Button
                size="sm"
                className="bg-orange-500 hover:bg-orange-600 gap-1.5 text-white"
                onClick={() => { window.location.href = '/api/shopee/auth' }}
              >
                <Link2 className="w-3.5 h-3.5" />
                Connect Shopee
              </Button>
            )}
            {shopeeStatus.state === 'connected' && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => { window.location.href = '/api/shopee/auth' }}
              >
                Reconnect
              </Button>
            )}
          </div>
        </div>

        {/* TikTok Shop */}
        <div className="flex items-center justify-between p-4 border rounded-lg opacity-60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              T
            </div>
            <div>
              <p className="font-medium">TikTok Shop</p>
              <p className="text-xs text-muted-foreground">Integration coming soon</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs text-muted-foreground">
            Coming Soon
          </Badge>
        </div>
      </CardContent>
    </Card>
  )
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const [saved, setSaved] = useState(false)

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm">Manage your account and preferences</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>Update your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input defaultValue="John Doe" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input defaultValue="john@example.com" type="email" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Store Name</Label>
            <Input defaultValue="My Beauty Store" />
          </div>
          <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2" onClick={handleSave}>
            {saved ? <><Check className="w-4 h-4" /> Saved!</> : 'Save Changes'}
          </Button>
        </CardContent>
      </Card>

      {/* Platforms */}
      <Suspense fallback={
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connected Platforms</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          </CardContent>
        </Card>
      }>
        <ShopeeConnectionCard />
      </Suspense>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
          <CardDescription>Choose your preferred theme</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: 'light', label: 'Light', icon: Sun },
              { value: 'dark', label: 'Dark', icon: Moon },
              { value: 'system', label: 'System', icon: Monitor },
            ].map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={`flex flex-col items-center gap-2 p-4 border-2 rounded-lg transition-all ${
                  theme === value
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20'
                    : 'border-border hover:border-slate-400'
                }`}
              >
                <Icon className={`w-5 h-5 ${theme === value ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                <span className={`text-sm font-medium ${theme === value ? 'text-emerald-600' : ''}`}>{label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Currency */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Currency & Localization</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Currency</Label>
              <Input defaultValue="IDR — Indonesian Rupiah" readOnly className="bg-slate-50" />
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Input defaultValue="Asia/Jakarta (WIB)" readOnly className="bg-slate-50" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
