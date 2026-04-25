import React, { useState, useEffect } from 'react';
import { Globe, Send, ChevronDown, ChevronRight, Key, Save, RefreshCw, Copy, Check, AlertCircle, Loader2 } from 'lucide-react';

interface SwaggerEndpoint {
  path: string;
  method: string;
  summary: string;
  operationId: string;
  tags: string[];
  parameters: any[];
  requestBody?: any;
}

const METHOD_COLORS: Record<string, string> = {
  get: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  post: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  put: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  delete: 'bg-red-500/15 text-red-400 border-red-500/30',
  patch: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
};

export function ApiTester({ project }: { project: any }) {
  const [swaggerUrl, setSwaggerUrl] = useState('');
  const [endpoints, setEndpoints] = useState<SwaggerEndpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedEndpoint, setSelectedEndpoint] = useState<SwaggerEndpoint | null>(null);
  const [collapsedTags, setCollapsedTags] = useState<Record<string, boolean>>({});
  const [searchFilter, setSearchFilter] = useState('');

  // Request state
  const [reqParams, setReqParams] = useState<Record<string, string>>({});
  const [reqBody, setReqBody] = useState('');
  const [reqHeaders, setReqHeaders] = useState<Record<string, string>>({});
  const [response, setResponse] = useState<any>(null);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  // Credentials
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [showCredentials, setShowCredentials] = useState(false);

  // Try multiple common swagger spec paths
  const probeSwaggerUrls = async (baseUrl: string): Promise<string | null> => {
    const candidates = [
      `${baseUrl}/swagger/v1/swagger.json`,
      `${baseUrl}/swagger/v2/swagger.json`,
      `${baseUrl}/api-doc/v1/swagger.json`,
      `${baseUrl}/api-docs/v1/swagger.json`,
      `${baseUrl}/swagger.json`,
    ];
    for (const url of candidates) {
      try {
        const res = await fetch('http://127.0.0.1:3030/api/proxy/swagger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.paths || data.openapi || data.swagger) {
            return url;
          }
        }
      } catch(e) {}
    }
    return null;
  };

  const fetchSwagger = async (urlToFetch?: string) => {
    const targetUrl = urlToFetch || swaggerUrl;
    if (!targetUrl) return;
    
    setLoading(true);
    setError('');
    setEndpoints([]);
    
    // First try the current URL, then auto-probe if it fails
    let urlToUse = targetUrl;
    let spec: any = null;
    
    try {
      const res = await fetch('http://127.0.0.1:3030/api/proxy/swagger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlToUse })
      });
      if (res.ok) {
        spec = await res.json();
        if (!spec.paths && !spec.openapi && !spec.swagger) spec = null;
      }
    } catch(e) {}

    // Auto-probe if direct URL failed
    if (!spec) {
      const baseUrl = targetUrl.replace(/\/swagger.*/, '').replace(/\/api-doc.*/, '');
      const foundUrl = await probeSwaggerUrls(baseUrl);
      if (foundUrl) {
        setSwaggerUrl(foundUrl);
        urlToUse = foundUrl;
        try {
          const res = await fetch('http://127.0.0.1:3030/api/proxy/swagger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: foundUrl })
          });
          if (res.ok) spec = await res.json();
        } catch(e) {}
      }
    }

    if (!spec) {
      setError('Swagger spec not found. Make sure the API is running and the URL is correct. Tried multiple common paths.');
      setLoading(false);
      return;
    }

    // Parse OpenAPI/Swagger spec into endpoints
    const eps: SwaggerEndpoint[] = [];
    const paths = spec.paths || {};
    for (const [path, methods] of Object.entries(paths)) {
      for (const [method, details] of Object.entries(methods as any)) {
        if (['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(method)) {
          const d = details as any;
          eps.push({
            path,
            method,
            summary: d.summary || d.description || '',
            operationId: d.operationId || '',
            tags: d.tags || ['Untagged'],
            parameters: d.parameters || [],
            requestBody: d.requestBody
          });
        }
      }
    }
    setEndpoints(eps);
    setLoading(false);
  };

  // Auto-detect swagger URL from project quickLinks and auto-fetch
  useEffect(() => {
    if (!project) return;
    const swaggerLink = (project.quickLinks || []).find((l: any) => 
      l.label.toLowerCase().includes('swagger') || l.url.includes('api-doc')
    );
    let baseUrl = 'http://localhost:5000';
    if (swaggerLink) {
      baseUrl = swaggerLink.url.replace(/\/api-doc.*/, '').replace(/\/swagger.*/, '');
    }
    
    const defaultUrl = `${baseUrl}/swagger/v1/swagger.json`;
    setSwaggerUrl(defaultUrl);
    
    // Auto-load swagger right away
    fetchSwagger(defaultUrl);

    // Load saved credentials
    fetch('http://127.0.0.1:3030/api/credentials')
      .then(r => r.json())
      .then(data => {
        if (data[project.id]) setCredentials(data[project.id]);
      })
      .catch(() => {});
  }, [project?.id]);

  if (!project) return null;

  const selectEndpoint = (ep: SwaggerEndpoint) => {
    setSelectedEndpoint(ep);
    setResponse(null);
    setReqBody('');
    const params: Record<string, string> = {};
    ep.parameters?.forEach(p => { params[p.name] = ''; });
    setReqParams(params);
  };

  const buildUrl = () => {
    if (!selectedEndpoint) return '';
    const baseUrl = swaggerUrl.replace(/\/swagger.*/, '');
    let url = baseUrl + selectedEndpoint.path;
    // Replace path params
    for (const [key, value] of Object.entries(reqParams)) {
      url = url.replace(`{${key}}`, encodeURIComponent(value));
    }
    // Add query params
    const queryParams = selectedEndpoint.parameters
      ?.filter(p => p.in === 'query' && reqParams[p.name])
      .map(p => `${p.name}=${encodeURIComponent(reqParams[p.name])}`)
      .join('&');
    if (queryParams) url += '?' + queryParams;
    return url;
  };

  const sendRequest = async () => {
    if (!selectedEndpoint) return;
    setSending(true);
    setResponse(null);
    try {
      const url = buildUrl();
      const headers: Record<string, string> = { ...reqHeaders };
      
      // Apply credentials
      if (credentials.token) {
        headers['Authorization'] = `Bearer ${credentials.token}`;
      }
      if (credentials.apiKey) {
        headers['X-API-Key'] = credentials.apiKey;
      }

      const res = await fetch('http://127.0.0.1:3030/api/proxy/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          method: selectedEndpoint.method,
          headers,
          body: reqBody && selectedEndpoint.method !== 'get' ? reqBody : undefined
        })
      });
      const data = await res.json();
      setResponse(data);
    } catch (err: any) {
      setResponse({ status: 0, body: err.message, headers: {} });
    }
    setSending(false);
  };

  const saveCredentials = async () => {
    try {
      await fetch('http://127.0.0.1:3030/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, credentials })
      });
    } catch(e) {}
  };

  const copyResponse = () => {
    if (response?.body) {
      navigator.clipboard.writeText(response.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  // Group endpoints by tag
  const tagGroups: Record<string, SwaggerEndpoint[]> = {};
  endpoints
    .filter(ep => !searchFilter || ep.path.toLowerCase().includes(searchFilter.toLowerCase()) || ep.summary.toLowerCase().includes(searchFilter.toLowerCase()))
    .forEach(ep => {
      const tag = ep.tags[0] || 'Untagged';
      if (!tagGroups[tag]) tagGroups[tag] = [];
      tagGroups[tag].push(ep);
    });

  const formatJson = (str: string) => {
    try { return JSON.stringify(JSON.parse(str), null, 2); } catch { return str; }
  };

  return (
    <div className="flex flex-col h-full bg-[#0b1120] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-slate-800 bg-slate-950/80 shrink-0">
        <div className="flex items-center gap-3 mb-2">
          <Globe className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-bold text-white">API Tester</h2>
          <span className="text-xs text-slate-500">{endpoints.length} Endpoints</span>
        </div>
        <div className="flex gap-2">
          <input type="text" value={swaggerUrl} onChange={e => setSwaggerUrl(e.target.value)}
            placeholder="Swagger JSON URL (e.g. http://localhost:5000/swagger/v1/swagger.json)"
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-[11px] font-mono text-slate-200 focus:outline-none focus:border-blue-500/50" />
          <button onClick={fetchSwagger} disabled={loading}
            className="px-3 py-1.5 bg-blue-500/10 text-blue-400 text-[11px] font-bold rounded-lg border border-blue-500/20 hover:bg-blue-500/20 transition-all flex items-center gap-1 shrink-0 disabled:opacity-50">
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            {loading ? 'Loading...' : 'Load Swagger'}
          </button>
          <button onClick={() => setShowCredentials(!showCredentials)}
            className={`px-3 py-1.5 text-[11px] font-bold rounded-lg border transition-all flex items-center gap-1 shrink-0 ${
              showCredentials ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
            }`}>
            <Key className="w-3 h-3" /> Auth
          </button>
        </div>
        {error && (
          <div className="mt-2 flex items-center gap-2 text-xs text-red-400 bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20">
            <AlertCircle className="w-3 h-3" /> {error}
          </div>
        )}
        {/* Credentials Panel */}
        {showCredentials && (
          <div className="mt-2 bg-slate-900/50 border border-slate-800 rounded-lg p-3 space-y-2">
            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Saved Credentials (per project)</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Bearer Token</label>
                <input type="password" value={credentials.token || ''} onChange={e => setCredentials(prev => ({ ...prev, token: e.target.value }))}
                  placeholder="eyJhbGciOi..." className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[10px] font-mono text-white outline-none" />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">API Key</label>
                <input type="password" value={credentials.apiKey || ''} onChange={e => setCredentials(prev => ({ ...prev, apiKey: e.target.value }))}
                  placeholder="your-api-key" className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[10px] font-mono text-white outline-none" />
              </div>
            </div>
            <button onClick={saveCredentials}
              className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors flex items-center gap-1">
              <Save className="w-3 h-3" /> Save Credentials
            </button>
          </div>
        )}
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Endpoint List */}
        <div className="w-[320px] border-r border-slate-800 overflow-y-auto custom-scrollbar bg-slate-900/30 shrink-0">
          <div className="p-2 border-b border-slate-800/50 sticky top-0 bg-slate-900/90 backdrop-blur z-10">
            <input type="text" value={searchFilter} onChange={e => setSearchFilter(e.target.value)}
              placeholder="Filter endpoints..." className="w-full bg-slate-950 border border-slate-700/50 rounded px-2.5 py-1.5 text-[10px] text-slate-300 focus:outline-none focus:border-blue-500/50" />
          </div>

          {endpoints.length === 0 && !loading && (
            <div className="p-6 text-center text-slate-500 text-xs">
              <Globe className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p>No endpoints loaded.</p>
              <p className="text-slate-600 mt-1">Enter a Swagger URL and click "Load Swagger".</p>
            </div>
          )}

          {Object.entries(tagGroups).sort().map(([tag, eps]) => (
            <div key={tag}>
              <button onClick={() => setCollapsedTags(prev => ({ ...prev, [tag]: !prev[tag] }))}
                className="w-full flex items-center gap-1.5 px-3 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-wider hover:bg-slate-800/50 transition-colors border-b border-slate-800/30">
                {collapsedTags[tag] ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {tag} ({eps.length})
              </button>
              {!collapsedTags[tag] && eps.map((ep, i) => (
                <button key={`${ep.method}-${ep.path}-${i}`}
                  onClick={() => selectEndpoint(ep)}
                  className={`w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-slate-800/50 transition-colors border-b border-slate-800/20 ${
                    selectedEndpoint?.operationId === ep.operationId && selectedEndpoint?.path === ep.path ? 'bg-blue-500/10 border-l-2 border-l-blue-400' : ''
                  }`}>
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border shrink-0 mt-0.5 ${METHOD_COLORS[ep.method] || 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                    {ep.method}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono text-slate-300 truncate">{ep.path}</div>
                    {ep.summary && <div className="text-[9px] text-slate-500 truncate mt-0.5">{ep.summary}</div>}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Request/Response Panel */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {!selectedEndpoint ? (
            <div className="flex-1 flex items-center justify-center text-slate-500">
              <div className="text-center">
                <Send className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Select an endpoint to test</p>
              </div>
            </div>
          ) : (
            <>
              {/* Request Builder */}
              <div className="p-4 border-b border-slate-800 bg-slate-900/30 shrink-0 space-y-3">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${METHOD_COLORS[selectedEndpoint.method] || ''}`}>
                    {selectedEndpoint.method}
                  </span>
                  <span className="text-sm font-mono text-slate-200 truncate flex-1">{buildUrl() || selectedEndpoint.path}</span>
                  <button onClick={sendRequest} disabled={sending}
                    className="px-4 py-1.5 bg-blue-500 hover:bg-blue-400 text-white text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 shrink-0 shadow-lg shadow-blue-500/20">
                    {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    Send
                  </button>
                </div>
                {selectedEndpoint.summary && (
                  <div className="text-xs text-slate-400">{selectedEndpoint.summary}</div>
                )}

                {/* Parameters */}
                {selectedEndpoint.parameters.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Parameters</div>
                    {selectedEndpoint.parameters.map((p, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[9px] text-slate-500 px-1.5 py-0.5 bg-slate-800 rounded shrink-0 uppercase">{p.in}</span>
                        <span className="text-[10px] text-slate-300 font-mono shrink-0 w-28 truncate">{p.name}</span>
                        <input type="text" value={reqParams[p.name] || ''} onChange={e => setReqParams(prev => ({ ...prev, [p.name]: e.target.value }))}
                          placeholder={p.required ? '(required)' : '(optional)'}
                          className={`flex-1 bg-slate-950 border rounded px-2 py-1 text-[10px] font-mono text-white outline-none ${p.required ? 'border-amber-500/30' : 'border-slate-700'}`} />
                      </div>
                    ))}
                  </div>
                )}

                {/* Request Body */}
                {selectedEndpoint.method !== 'get' && (
                  <div>
                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Request Body (JSON)</div>
                    <textarea value={reqBody} onChange={e => setReqBody(e.target.value)} rows={4}
                      placeholder='{ "key": "value" }'
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-[10px] font-mono text-white outline-none focus:border-blue-500/50 resize-y" />
                  </div>
                )}
              </div>

              {/* Response */}
              <div className="flex-1 overflow-auto p-4 bg-[#0b1120]">
                {response ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          response.status >= 200 && response.status < 300 ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
                          response.status >= 400 ? 'bg-red-500/15 text-red-400 border-red-500/30' :
                          'bg-amber-500/15 text-amber-400 border-amber-500/30'
                        }`}>
                          {response.status || 'ERR'}
                        </span>
                        <span className="text-xs text-slate-400">
                          {response.status >= 200 && response.status < 300 ? 'OK' :
                           response.status >= 400 && response.status < 500 ? 'Client Error' :
                           response.status >= 500 ? 'Server Error' : 'Error'}
                        </span>
                      </div>
                      <button onClick={copyResponse}
                        className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-800 transition-colors">
                        {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-[10px] font-mono text-slate-300 overflow-auto max-h-[60vh] whitespace-pre-wrap">
                      {formatJson(response.body)}
                    </pre>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-600 text-xs">
                    Click "Send" to execute the request.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
