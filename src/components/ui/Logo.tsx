import React from 'react';

interface LogoProps {
  className?: string;
  showText?: boolean;
  textClassName?: string;
  subTextClassName?: string;
}

const Logo: React.FC<LogoProps> = ({
  className = '',
  showText = true,
  textClassName = 'text-slate-900 dark:text-slate-100',
  subTextClassName = 'text-slate-400',
}) => {
  return (
    <div className={`flex items-center gap-3 ${className}`.trim()}>
      <img src="/logo.png" alt="Dualis ERP" className="h-10 w-auto" />
      {showText && (
        <div className="leading-tight">
          <div className={`text-base font-black tracking-tight ${textClassName}`.trim()}>
            DUALIS
          </div>
          <div className={`text-[10px] font-black uppercase tracking-[0.3em] ${subTextClassName}`.trim()}>
            ERP
          </div>
        </div>
      )}
    </div>
  );
};

export default Logo;
