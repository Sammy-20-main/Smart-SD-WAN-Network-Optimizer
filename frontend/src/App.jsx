import React, { useEffect, useState } from 'react';
import { NetworkProvider } from './context/NetworkContext';
import { SignBar, TicketStrip, Foot, PAGES } from './components/Shell';
import Board from './pages/Board';
import MapPage from './pages/MapPage';
import Routes from './pages/Routes';
import Reports from './pages/Reports';
import ChaosLab from './pages/ChaosLab';
import Studio from './pages/Studio';
import History from './pages/History';

const VIEWS = { board: Board, map: MapPage, routes: Routes, reports: Reports, chaos: ChaosLab, studio: Studio, history: History };
const readHash = () => {
  const id = window.location.hash.replace(/^#\/?/, '');
  return PAGES.some((p) => p.id === id) ? id : 'board';
};

export default function App() {
  const [page, setPage] = useState(readHash());
  useEffect(() => {
    const on = () => { setPage(readHash()); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    document.title = `${PAGES.find((p) => p.id === page).label} | Waypoint`;
  }, [page]);
  const View = VIEWS[page];
  return (
    <NetworkProvider>
      <SignBar page={page} />
      <TicketStrip />
      <main><View /></main>
      <Foot />
    </NetworkProvider>
  );
}
