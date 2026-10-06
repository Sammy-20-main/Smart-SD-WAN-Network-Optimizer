import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../services/engine';

const Ctx = createContext(null);
export const useNetwork = () => useContext(Ctx);

const blankTopology = () => ({
  id: 'draft',
  name: 'My network',
  description: '',
  isPreset: false,
  nodes: [],
  links: [],
  defaults: { sourceId: '', destinationId: '', slaLimit: 100 }
});

export function NetworkProvider({ children }) {
  const [topologies, setTopologies] = useState([]);
  const [dataSource, setDataSource] = useState(null); // 'server' | 'browser'
  const [preset, setPreset] = useState(null); // the active network, possibly an unsaved draft
  const [dirty, setDirty] = useState(false);
  const [sourceId, setSourceId] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [slaLimit, setSlaLimit] = useState(125);
  const [routingMode, setRoutingMode] = useState('risk-aware');
  const [jitterPct, setJitterPct] = useState(15);
  const [confidenceTarget, setConfidenceTarget] = useState(95);
  const [breachPenalty, setBreachPenalty] = useState(10000);

  const [report, setReport] = useState(null);
  const [engineSource, setEngineSource] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportError, setExportError] = useState(null);

  const applyDefaults = (t) => {
    setSourceId(t.defaults.sourceId);
    setDestinationId(t.defaults.destinationId);
    setSlaLimit(t.defaults.slaLimit);
  };

  const refreshTopologies = useCallback(async () => {
    const { list, source } = await api.loadTopologies();
    setTopologies(list);
    setDataSource(source);
    return { list, source };
  }, []);

  useEffect(() => {
    refreshTopologies().then(async ({ list, source }) => {
      const first = list.find((p) => p.slug === 'mesh') || list[0];
      if (!first) return;
      const full = await api.loadTopology(first.id, source);
      setPreset(full);
      applyDefaults(full);
    });
  }, [refreshTopologies]);

  const chooseTopology = useCallback(async (id) => {
    const key = dataSource === 'browser' ? String(id) : Number(id);
    const full = await api.loadTopology(key, dataSource);
    setPreset(full);
    setDirty(false);
    applyDefaults(full);
  }, [dataSource]);

  /** Change the active network. Samples are read-only, so the first edit forks a draft copy. */
  const editTopology = useCallback((updater) => {
    setPreset((current) => {
      const base = current && !current.isPreset
        ? current
        : { ...(current || blankTopology()), id: 'draft', name: current ? `${current.name} (copy)` : 'My network', isPreset: false, local: false, slug: undefined };
      const next = updater(structuredClone(base));
      return next;
    });
    setDirty(true);
  }, []);

  const newTopology = useCallback(() => {
    const t = blankTopology();
    setPreset(t);
    setDirty(true);
    setSourceId('');
    setDestinationId('');
  }, []);

  const loadDraft = useCallback((t) => {
    setPreset({ ...t, id: 'draft', isPreset: false, slug: undefined });
    setDirty(true);
    applyDefaults(t);
  }, []);

  const persistable = dataSource === 'server';
  const saved = typeof preset?.id === 'number';

  const payloadFrom = (t, name) => ({
    name: name ?? t.name,
    description: t.description,
    nodes: t.nodes,
    links: t.links,
    sourceId: sourceId || t.defaults?.sourceId,
    destinationId: destinationId || t.defaults?.destinationId,
    slaLimit
  });

  const saveTopology = useCallback(async ({ asNew = false, name } = {}) => {
    const body = payloadFrom(preset, name);
    const out = asNew || !saved || preset.isPreset ? await api.createTopology(body) : await api.updateTopology(preset.id, body);
    setPreset(out);
    setDirty(false);
    await refreshTopologies();
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, saved, sourceId, destinationId, slaLimit, refreshTopologies]);

  const removeTopology = useCallback(async () => {
    if (!saved || preset.isPreset) return;
    await api.deleteTopology(preset.id);
    const { list, source } = await refreshTopologies();
    const first = list[0];
    if (first) {
      const full = await api.loadTopology(first.id, source);
      setPreset(full);
      applyDefaults(full);
    }
    setDirty(false);
  }, [preset, saved, refreshTopologies]);

  const reloadActive = useCallback(async () => {
    if (!saved) return null;
    const full = await api.loadTopology(preset.id, dataSource);
    setPreset(full);
    return full;
  }, [preset, saved, dataSource]);

  // Keep the chosen sites valid when nodes are removed or renamed.
  useEffect(() => {
    if (!preset) return;
    const ids = preset.nodes.map((n) => n.id);
    if (sourceId && !ids.includes(sourceId)) setSourceId(ids[0] || '');
    if (destinationId && !ids.includes(destinationId)) setDestinationId(ids[ids.length - 1] || '');
    if (!sourceId && ids.length > 1) setSourceId(ids[0]);
    if (!destinationId && ids.length > 1) setDestinationId(ids[ids.length - 1]);
  }, [preset, sourceId, destinationId]);

  // The engine only needs the graph, so moving a node on the canvas must not trigger a new analysis.
  const graphKey = useMemo(() => {
    if (!preset) return '';
    return JSON.stringify([preset.nodes.map((n) => [n.id, n.label, n.kind, n.monthlyCost]), preset.links]);
  }, [preset]);
  const graph = useMemo(() => (preset ? { nodes: preset.nodes, links: preset.links } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graphKey]);

  const request = useMemo(() => {
    if (!graph || !sourceId || !destinationId || sourceId === destinationId) return null;
    return {
      nodes: graph.nodes,
      links: graph.links,
      sourceId,
      destinationId,
      slaLimit,
      options: {
        routingMode,
        jitterRatio: jitterPct / 100,
        confidenceTarget: confidenceTarget / 100,
        breachPenaltyUsd: breachPenalty
      }
    };
  }, [graph, sourceId, destinationId, slaLimit, routingMode, jitterPct, confidenceTarget, breachPenalty]);

  const latest = useRef(0);
  useEffect(() => {
    if (!request) {
      if (preset) {
        setReport(null);
        setLoading(false);
        setError(preset.nodes.length < 2 ? 'Add at least two sites to the network, then pick where traffic starts and ends.' : 'Pick two different sites.');
      }
      return undefined;
    }
    const id = ++latest.current;
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const out = await api.analyze(request, controller.signal);
        if (id !== latest.current) return;
        setEngineSource(out.source);
        if (out.error) {
          setError(out.error);
          setReport(null);
        } else {
          setError(null);
          setReport(out.report);
        }
      } catch (e) {
        if (e.name !== 'AbortError' && id === latest.current) setError(e.message);
      } finally {
        if (id === latest.current) setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [request, preset]);

  const exportCsv = useCallback(async (table) => {
    setExportError(null);
    if (request && report) await api.downloadCsv(request, report, table);
  }, [request, report]);
  const exportPdf = useCallback(async () => {
    setExportError(null);
    try {
      if (request) await api.downloadPdf(request);
    } catch (e) {
      setExportError(e.message);
    }
  }, [request]);

  /** Saves the current analysis (recomputed on the server from the stored network). */
  const saveCurrentRun = useCallback(async () => {
    if (!saved) throw new Error('Save this network to the database first.');
    const out = await api.saveRun(preset.id, {
      sourceId, destinationId, slaLimit,
      options: request.options
    });
    await refreshTopologies();
    return out;
  }, [saved, preset, sourceId, destinationId, slaLimit, request, refreshTopologies]);

  const value = {
    topologies, preset, topologyId: preset?.id, dirty, saved, persistable, dataSource,
    chooseTopology, editTopology, newTopology, loadDraft, saveTopology, removeTopology, reloadActive, refreshTopologies,
    sourceId, setSourceId, destinationId, setDestinationId,
    slaLimit, setSlaLimit, routingMode, setRoutingMode,
    jitterPct, setJitterPct, confidenceTarget, setConfidenceTarget, breachPenalty, setBreachPenalty,
    report, error, loading, engineSource, exportCsv, exportPdf, exportError, saveCurrentRun
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
