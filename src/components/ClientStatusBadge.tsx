import React from 'react';
import { ClientTag } from '../utils/clientStatus';

interface ClientStatusBadgeProps {
  tags?: ClientTag[];
  maxTags?: number;
  className?: string;
}

const ClientStatusBadge: React.FC<ClientStatusBadgeProps> = ({
  tags = [],
  maxTags = 3,
  className = '',
}) => {
  const visibleTags = tags.slice(0, maxTags);
  if (visibleTags.length === 0) return null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {visibleTags.map((tag) => (
        <span
          key={tag.key}
          title={tag.tooltip}
          className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${tag.className}`}
        >
          {tag.label}
        </span>
      ))}
    </div>
  );
};

export default ClientStatusBadge;
