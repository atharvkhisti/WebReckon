import React from 'react';
import { Card, CardContent, CardDescription, CardHeader } from './ui/card';
import { Badge } from './ui/badge';
import { Globe, FileText, AlertTriangle, Shield, Flag } from 'lucide-react';

interface ApiCall {
  url: string;
  method: string;
  status?: number;
  type?: string;
  host?: string;
  contentType?: string;
  guessPurpose?: string;
  isThirdParty?: boolean;
  maybeSensitive?: boolean;
  isSuspicious?: boolean;
}

interface ApiListProps {
  apiCalls?: ApiCall[];
  searchQuery?: string;
  methodFilter?: string;
  hostFilter?: string;
  purposeFilter?: string;
}

const getMethodBadgeVariant = (method: string) => {
  switch (method) {
    case 'GET': return 'default';
    case 'POST': return 'default';
    case 'PUT': return 'secondary';
    case 'DELETE': return 'destructive';
    case 'PATCH': return 'secondary';
    default: return 'outline';
  }
};

const getMethodBadgeClass = (method: string) => {
  switch (method) {
    case 'GET': return 'bg-green-600 hover:bg-green-700 text-white border-0';
    case 'POST': return 'bg-blue-600 hover:bg-blue-700 text-white border-0';
    case 'PUT': return 'bg-orange-600 hover:bg-orange-700 text-white border-0';
    case 'DELETE': return 'bg-red-600 hover:bg-red-700 text-white border-0';
    case 'PATCH': return 'bg-purple-600 hover:bg-purple-700 text-white border-0';
    default: return 'bg-slate-600 hover:bg-slate-700 text-white border-0';
  }
};

const getStatusBadgeClass = (status?: number) => {
  if (!status) return 'bg-slate-500 hover:bg-slate-600 text-white border-0';
  if (status >= 200 && status < 300) return 'bg-green-600 hover:bg-green-700 text-white border-0';
  if (status >= 400) return 'bg-red-600 hover:bg-red-700 text-white border-0';
  return 'bg-yellow-600 hover:bg-yellow-700 text-white border-0';
};

const ApiList: React.FC<ApiListProps> = ({ 
  apiCalls = [], 
  searchQuery = '', 
  methodFilter = '', 
  hostFilter = '', 
  purposeFilter = '' 
}) => {
  if (!apiCalls) return null;
  
  const filteredCalls = apiCalls.filter((call) => {
    const matchesSearch = call.url.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMethod = methodFilter === '' || call.method === methodFilter;
    const matchesHost = hostFilter === '' || call.host === hostFilter;
    const matchesPurpose = purposeFilter === '' || (call.guessPurpose || 'other') === purposeFilter;
    return matchesSearch && matchesMethod && matchesHost && matchesPurpose;
  });

  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {filteredCalls.map((call, index) => (
        <Card key={index} className="group hover:shadow-2xl transition-all duration-300 hover:border-blue-300 border-2 border-slate-200 bg-white hover:-translate-y-1">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between mb-3">
              <Badge className={`text-xs font-bold px-3 py-1.5 ${getMethodBadgeClass(call.method)}`}>
                {call.method}
              </Badge>
              <Badge className={`text-xs font-bold px-3 py-1.5 ${getStatusBadgeClass(call.status)}`}>
                {call.status ?? '—'}
              </Badge>
            </div>
            <CardDescription className="text-xs font-mono break-all line-clamp-2 group-hover:text-blue-700 transition-colors text-slate-700 font-semibold">
              {call.url}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {/* Metadata */}
            <div className="space-y-2.5 text-xs bg-slate-50 p-3 rounded-lg">
              {call.host && (
                <div className="flex items-start gap-2">
                  <Globe className="h-3.5 w-3.5 mt-0.5 text-blue-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-slate-600">Host: </span>
                    <span className="text-slate-800 font-medium truncate block">{call.host}</span>
                  </div>
                </div>
              )}
              {call.type && (
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-purple-600 flex-shrink-0" />
                  <span className="font-bold text-slate-600">Type: </span>
                  <span className="text-slate-800 font-medium">{call.type}</span>
                </div>
              )}
              {call.contentType && (
                <div className="flex items-start gap-2">
                  <FileText className="h-3.5 w-3.5 mt-0.5 text-green-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-slate-600">Content: </span>
                    <span className="text-slate-800 font-medium truncate block">{call.contentType}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-2">
              {call.guessPurpose && call.guessPurpose !== 'other' && (
                <Badge variant="secondary" className="text-xs font-bold bg-indigo-100 text-indigo-700 border-indigo-200">
                  {call.guessPurpose.toUpperCase()}
                </Badge>
              )}
              {call.isThirdParty && (
                <Badge variant="outline" className="text-xs font-bold border-2 border-yellow-400 text-yellow-700 bg-yellow-50">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  3RD-PARTY
                </Badge>
              )}
              {call.maybeSensitive && (
                <Badge variant="outline" className="text-xs font-bold border-2 border-red-400 text-red-700 bg-red-50">
                  <Shield className="h-3 w-3 mr-1" />
                  SENSITIVE
                </Badge>
              )}
              {call.isSuspicious && (
                <Badge variant="outline" className="text-xs font-bold border-2 border-orange-400 text-orange-700 bg-orange-50 animate-pulse">
                  <Flag className="h-3 w-3 mr-1" />
                  SUSPICIOUS
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default ApiList;
