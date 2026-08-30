import React from 'react';

/**
 * Chrome 扩展管理页风格拨动开关（与设置页 Toggle 同款）：
 * 轨道 36×14 全圆角，圆点 20px 突出轨道；圆点在右 = 开（蓝），在左 = 关（灰）。
 */
const Toggle: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}> = ({ checked, onChange, disabled, size = 'md' }) => {
  // sm 适配 popup 紧凑布局：轨道 30×12，圆点 16
  const track = size === 'sm' ? 'w-[30px] h-3' : 'w-9 h-3.5';
  const knob = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const knobLeftOn = size === 'sm' ? 'left-[calc(100%-14px)]' : 'left-[calc(100%-18px)]';
  const knobLeftOff = size === 'sm' ? 'left-[-2px]' : 'left-[-2px]';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative ${track} rounded-full transition-colors shrink-0 my-1.5 focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:outline-none ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${checked ? 'bg-primary-500' : 'bg-slate-300 dark:bg-slate-600'}`}
    >
      <span
        className={`absolute top-1/2 -translate-y-1/2 ${knob} rounded-full bg-white shadow-md transition-all duration-200 ${
          checked ? knobLeftOn : knobLeftOff
        }`}
      />
    </button>
  );
};

export default Toggle;
