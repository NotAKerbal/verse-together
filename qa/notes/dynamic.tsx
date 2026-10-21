import {lazy,Suspense,type ComponentType,type ReactNode} from "react";
export default function dynamic<P extends object>(loader:()=>Promise<{default:ComponentType<P>}>,options:{loading?:()=>ReactNode}){const C=lazy(loader);return function QaLazy(props:P){return <Suspense fallback={options.loading?.()}><C {...props}/></Suspense>;};}
