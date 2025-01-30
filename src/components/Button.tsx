import { ReactNode } from "react";

interface ButtonProps {
  type: 'submit' | 'button';
  children: ReactNode;
  disabled?: boolean;
}

export default function Button(props: ButtonProps) {
  return (
    <button
      type={props.type}
      className="px-6 py-2 bg-blue-950 text-white hover:bg-blue-900 disabled:opacity-50 disabled:cursor-not-allowed"
      disabled={props.disabled}
    >
      {props.children}
    </button>
  );
}
