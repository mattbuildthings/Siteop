/**
 * @startingPoint section="Components" subtitle="Primary action button, 3 sizes, 5 variants" viewport="700x220"
 */
export interface ButtonProps{
variant?:'primary'|'accent'|'secondary'|'ghost'|'danger';
size?:'sm'|'md'|'lg';
disabled?:boolean;
icon?:React.ReactNode;
children:React.ReactNode;
onClick?:()=>void;
}
