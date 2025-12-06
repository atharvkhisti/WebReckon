import { useState } from 'react';
import { Search, Loader2, TrendingUp, Globe, Shield, AlertTriangle, Activity } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import ApiList from '../components/ApiList';

interface Endpoint {
  url: string;
  method: string;
  status?: number;
  type: string;
  contentType?: string;
  host: string;
  path: string;
  guessPurpose?: string;
  isThirdParty?: boolean;
  maybeSensitive?: boolean;
  isSuspicious?: boolean;
  firstSeenAt: string;
}

interface Summary {
  totalEndpoints: number;
  byMethod: Record<string, number>;
  byType: Record<string, number>;
  byHost: Record<string, number>;
  byPurpose?: Record<string, number>;
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [hostFilter, setHostFilter] = useState('');
  const [purposeFilter, setPurposeFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDiscovery = async () => {
    if (!url) return;

    setIsLoading(true);
    setError('');
    
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';
      const response = await fetch(`${baseUrl}/discover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        throw new Error('Failed to discover APIs');
      }

      const data = await response.json();
      if (data.status === 'success' && data.data) {
        setEndpoints(data.data.endpoints || []);
        setSummary(data.data.summary || null);
      } else {
        throw new Error(data.message || 'Failed to discover APIs');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to discover APIs');
      console.error('Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-600 via-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                <Activity className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-blue-500 to-purple-600 bg-clip-text text-transparent">
                  WebReckon
                </h1>
                <p className="text-sm text-slate-600 font-medium">API Discovery Tool</p>
              </div>
            </div>
            <Badge variant="outline" className="hidden md:flex border-blue-200 bg-blue-50 text-blue-700 px-3 py-1.5">
              <Globe className="h-3 w-3 mr-1.5" />
              Browser-Side Analysis
            </Badge>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-7xl">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h2 className="text-5xl md:text-6xl font-extrabold mb-6 bg-gradient-to-r from-slate-900 via-blue-800 to-indigo-900 bg-clip-text text-transparent leading-tight">
            Discover APIs in Real-Time
          </h2>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto font-medium">
            Launch a real browser, intercept network traffic, and automatically map all APIs with intelligent tagging and security insights
          </p>
        </div>

        {/* Search Section */}
        <Card className="mb-10 border-2 border-blue-100 shadow-xl bg-white">
          <CardContent className="pt-8 pb-8">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Globe className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <Input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Enter target URL (e.g., https://example.com)"
                  className="pl-12 h-14 text-base border-2 border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  onKeyDown={(e) => e.key === 'Enter' && !isLoading && url && handleDiscovery()}
                />
              </div>
              <Button
                onClick={handleDiscovery}
                disabled={isLoading || !url}
                size="lg"
                className="bg-gradient-to-r from-blue-600 via-blue-500 to-purple-600 hover:from-blue-700 hover:via-blue-600 hover:to-purple-700 h-14 px-10 text-base font-semibold shadow-lg hover:shadow-xl transition-all"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Discovering...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-5 w-5" />
                    Start Discovery
                  </>
                )}
              </Button>
            </div>
            {error && (
              <div className="mt-6 p-5 bg-red-50 border-2 border-red-200 rounded-xl flex items-start gap-3">
                <AlertTriangle className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800 font-medium">{error}</p>
              </div>
            )}
          </CardContent>
        </Card>
        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            <Card className="border-l-4 border-l-blue-600 shadow-lg bg-gradient-to-br from-white to-blue-50 hover:shadow-xl transition-shadow">
              <CardHeader className="pb-3">
                <CardDescription className="flex items-center gap-2 text-blue-600 font-semibold">
                  <TrendingUp className="h-4 w-4" />
                  Total Endpoints
                </CardDescription>
                <CardTitle className="text-5xl font-bold text-blue-700">{summary.totalEndpoints}</CardTitle>
              </CardHeader>
            </Card>

            <Card className="shadow-lg bg-white hover:shadow-xl transition-shadow">
              <CardHeader className="pb-2">
                <CardDescription className="font-semibold text-slate-700">HTTP Methods</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2.5">
                  {Object.entries(summary.byMethod).map(([method, count]) => (
                    <div key={method} className="flex justify-between items-center bg-slate-50 px-3 py-2 rounded-lg">
                      <Badge variant="outline" className="text-xs font-bold border-slate-300">{method}</Badge>
                      <span className="text-base font-bold text-slate-700">{count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-lg bg-white hover:shadow-xl transition-shadow">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2 font-semibold text-slate-700">
                  <Globe className="h-4 w-4" />
                  Hosts
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {Object.entries(summary.byHost).map(([host, count]) => (
                    <div key={host} className="flex justify-between items-center gap-2 text-sm bg-slate-50 px-3 py-2 rounded-lg">
                      <span className="truncate flex-1 font-medium text-slate-700">{host}</span>
                      <Badge variant="secondary" className="text-xs font-bold">{count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-lg bg-white hover:shadow-xl transition-shadow">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2 font-semibold text-slate-700">
                  <Shield className="h-4 w-4" />
                  Purposes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2.5">
                  {summary.byPurpose && Object.entries(summary.byPurpose).map(([purpose, count]) => (
                    <div key={purpose} className="flex justify-between items-center bg-slate-50 px-3 py-2 rounded-lg">
                      <span className="text-sm capitalize font-medium text-slate-700">{purpose}</span>
                      <Badge variant="secondary" className="text-xs font-bold">{count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Endpoints List */}
        {endpoints.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-3xl font-bold text-slate-800">Discovered Endpoints</h3>
              <span className="text-base text-slate-600 font-semibold bg-slate-100 px-4 py-2 rounded-lg">
                {endpoints.length} {endpoints.length === 1 ? 'endpoint' : 'endpoints'} found
              </span>
            </div>

            {/* Filters */}
            <Card className="mb-8 shadow-lg bg-white border-2 border-slate-200">
              <CardContent className="pt-6 pb-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search URLs..."
                      className="pl-10 border-2 border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <select
                    value={methodFilter}
                    onChange={(e) => setMethodFilter(e.target.value)}
                    className="flex h-10 w-full rounded-md border-2 border-slate-200 bg-white px-3 py-2 text-sm font-medium focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus-visible:outline-none"
                  >
                    <option value="">All Methods</option>
                    {Array.from(new Set(endpoints.map((e) => e.method))).map((method) => (
                      <option key={method} value={method}>{method}</option>
                    ))}
                  </select>
                  <select
                    value={hostFilter}
                    onChange={(e) => setHostFilter(e.target.value)}
                    className="flex h-10 w-full rounded-md border-2 border-slate-200 bg-white px-3 py-2 text-sm font-medium focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus-visible:outline-none"
                  >
                    <option value="">All Hosts</option>
                    {Array.from(new Set(endpoints.map((e) => e.host))).map((host) => (
                      <option key={host} value={host}>{host}</option>
                    ))}
                  </select>
                  <select
                    value={purposeFilter}
                    onChange={(e) => setPurposeFilter(e.target.value)}
                    className="flex h-10 w-full rounded-md border-2 border-slate-200 bg-white px-3 py-2 text-sm font-medium focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus-visible:outline-none"
                  >
                    <option value="">All Purposes</option>
                    {summary?.byPurpose && Object.keys(summary.byPurpose).map((purpose) => (
                      <option key={purpose} value={purpose}>{purpose.charAt(0).toUpperCase() + purpose.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </CardContent>
            </Card>

            <ApiList
              apiCalls={endpoints}
              searchQuery={searchQuery}
              methodFilter={methodFilter}
              hostFilter={hostFilter}
              purposeFilter={purposeFilter}
            />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && endpoints.length === 0 && !error && (
          <Card className="border-dashed border-2 border-slate-300 shadow-lg bg-gradient-to-br from-white to-slate-50">
            <CardContent className="pt-16 pb-16 text-center">
              <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center mb-6">
                <Search className="h-10 w-10 text-blue-600" />
              </div>
              <h3 className="text-2xl font-bold mb-3 text-slate-800">No endpoints discovered yet</h3>
              <p className="text-slate-600 mb-6 text-lg max-w-md mx-auto">
                Enter a URL above and click "Start Discovery" to begin analyzing API endpoints
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
