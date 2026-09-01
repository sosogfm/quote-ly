import { useEffect, useState } from 'react';
import { getProposals } from '@/api/proposals';

export default function ProposalList() {
  const PAGE_SIZE = 20;
  const [proposals, setProposals] = useState<any[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const loadPage = async (pageNumber: number) => {
    setLoading(true);
    try {
      const { proposals: newProposals, hasMore: more } = await getProposals(
        PAGE_SIZE,
        pageNumber * PAGE_SIZE
      );
      setProposals(prev => [...prev, ...newProposals]);
      setHasMore(more);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPage(page);
  }, [page]);


  const handleLoadMore = () => {
    if (hasMore && !loading) {
      setPage(prev => prev + 1);
    }
  };

  return (
    <div>
      {proposals.map(p => (
        <div key={p.id}>{p.title}</div>
      ))}
      {hasMore && (
        <button
          onClick={handleLoadMore}
          disabled={loading}
          className="mt-4 btn-primary"
        >
          {loading ? 'Carregando...' : 'Carregar mais'}
        </button>
      )}
    </div>
  );
}
