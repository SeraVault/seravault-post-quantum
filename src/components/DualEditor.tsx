import React from 'react';
import WYSIWYGEditor from './WYSIWYGEditor';

interface DualEditorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  sensitive?: boolean;
  disabled?: boolean;
  defaultMode?: 'markdown' | 'wysiwyg'; // Keep for backwards compatibility but ignored
}

const DualEditor: React.FC<DualEditorProps> = ({
  label,
  value,
  onChange,
  required = false,
  sensitive = false,
  disabled = false,
}) => {
  // Simply render the WYSIWYG editor - markdown mode removed
  return (
    <WYSIWYGEditor
      label={label}
      value={value}
      onChange={onChange}
      required={required}
      sensitive={sensitive}
      disabled={disabled}
    />
  );
};

export default DualEditor;