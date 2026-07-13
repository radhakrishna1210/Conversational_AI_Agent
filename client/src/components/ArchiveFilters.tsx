type Props = {
  activeTab: string;
  setActiveTab: (tab: string) => void;
};

export default function ArchiveFilters({
  activeTab,
  setActiveTab,
}: Props) {
  return (
    <div className="archive-filters">
      <button
        className={activeTab === 'all' ? 'active' : ''}
        onClick={() => setActiveTab('all')}
      >
        All
      </button>

      <button
        className={activeTab === 'feature' ? 'active' : ''}
        onClick={() => setActiveTab('feature')}
      >
        Features
      </button>

      <button
        className={activeTab === 'announcement' ? 'active' : ''}
        onClick={() => setActiveTab('announcement')}
      >
        Announcements
      </button>
    </div>
  );
}