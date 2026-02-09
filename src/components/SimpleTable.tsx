import React from 'react';

export default function SimpleTable({ columns, rows }: { columns: string[]; rows: any[] }) {
  return (
    <div className="overflow-x-auto bg-white rounded-lg border border-slate-100">
      <table className="min-w-full divide-y divide-slate-100">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
              {columns.map((c, j) => (
                <td key={j} className="px-4 py-3 text-sm text-slate-700">
                  {String(r[c.toLowerCase()] ?? r[c] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
