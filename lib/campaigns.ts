export type CampaignType =
  | 'Flash Sale Shopee'
  | 'Shopee Live'
  | 'Garansi Harga Terbaik'
  | 'Promo Voucher'
  | 'Gratis Ongkir XTRA'
  | 'Trending Brand Subsidi'
  | 'Iklan Shopee'
  | 'Affiliate'
  | 'Custom'

export type CampaignScore = 'Scale' | 'Monitor' | 'Stop' | 'Pending'
export type CampaignPlatform = 'Shopee' | 'TikTok Shop'

export interface Campaign {
  id: string
  name: string
  type: CampaignType
  platform: CampaignPlatform
  start_date: string
  end_date: string
  ad_spend: number
  revenue: number | null  // null = campaign still running / no data yet
  cogs: number
  notes: string
  created_at: string
}

export interface CampaignMetrics {
  roas: number | null
  gross_profit: number | null
  net_profit: number | null
  profit_margin: number | null
  score: CampaignScore
}

export function calcCampaignMetrics(c: Campaign): CampaignMetrics {
  if (c.revenue === null) {
    return { roas: null, gross_profit: null, net_profit: null, profit_margin: null, score: 'Pending' }
  }
  const roas = c.ad_spend > 0 ? c.revenue / c.ad_spend : 0
  const gross_profit = c.revenue - c.cogs
  const net_profit = gross_profit - c.ad_spend
  const profit_margin = c.revenue > 0 ? (net_profit / c.revenue) * 100 : 0

  let score: CampaignScore
  if (roas >= 3.0 && net_profit > 0) score = 'Scale'
  else if (roas >= 1.5) score = 'Monitor'
  else score = 'Stop'

  return { roas, gross_profit, net_profit, profit_margin, score }
}

export const CAMPAIGN_TYPES: CampaignType[] = [
  'Flash Sale Shopee',
  'Shopee Live',
  'Garansi Harga Terbaik',
  'Promo Voucher',
  'Gratis Ongkir XTRA',
  'Trending Brand Subsidi',
  'Iklan Shopee',
  'Affiliate',
  'Custom',
]

export const dummyCampaigns: Campaign[] = [
  {
    id: 'camp-001',
    name: 'Harbolnas 12.12 Flash Sale',
    type: 'Flash Sale Shopee',
    platform: 'Shopee',
    start_date: '2025-12-12',
    end_date: '2025-12-12',
    ad_spend: 5_000_000,
    revenue: 21_000_000,
    cogs: 8_500_000,
    notes: 'Flash sale 12.12, diskon 50%. Stok habis dalam 3 jam.',
    created_at: '2025-12-10T08:00:00.000Z',
  },
  {
    id: 'camp-002',
    name: 'Shopee Live Beauty Sunday',
    type: 'Shopee Live',
    platform: 'Shopee',
    start_date: '2026-01-19',
    end_date: '2026-01-19',
    ad_spend: 3_000_000,
    revenue: 6_300_000,
    cogs: 2_800_000,
    notes: 'Live streaming 2 jam, peak viewer 1.200 orang.',
    created_at: '2026-01-17T10:00:00.000Z',
  },
  {
    id: 'camp-003',
    name: 'Voucher Cashback 10rb Semua Produk',
    type: 'Promo Voucher',
    platform: 'Shopee',
    start_date: '2026-02-01',
    end_date: '2026-02-07',
    ad_spend: 2_000_000,
    revenue: 2_600_000,
    cogs: 1_800_000,
    notes: 'Voucher cashback 10.000 min. pembelian 100.000. Konversi rendah.',
    created_at: '2026-01-30T09:00:00.000Z',
  },
  {
    id: 'camp-004',
    name: 'Gratis Ongkir XTRA Maret',
    type: 'Gratis Ongkir XTRA',
    platform: 'Shopee',
    start_date: '2026-03-01',
    end_date: '2026-03-31',
    ad_spend: 1_500_000,
    revenue: 5_250_000,
    cogs: 2_200_000,
    notes: 'Program gratis ongkir subsidi Shopee. Volume order naik 40%.',
    created_at: '2026-02-28T08:00:00.000Z',
  },
  {
    id: 'camp-005',
    name: 'Iklan Shopee Search – Serum Vitamin C',
    type: 'Iklan Shopee',
    platform: 'Shopee',
    start_date: '2026-03-25',
    end_date: '2026-04-05',
    ad_spend: 800_000,
    revenue: null,
    cogs: 0,
    notes: 'Search ads produk unggulan. Kampanye masih berjalan.',
    created_at: '2026-03-24T11:00:00.000Z',
  },
]
