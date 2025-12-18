import{c,j as e}from"./index-DU-Tki5Q.js";/**
 * @license lucide-react v0.560.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const d=[["path",{d:"m15 18-6-6 6-6",key:"1wnfg3"}]],r=c("chevron-left",d);/**
 * @license lucide-react v0.560.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const h=[["path",{d:"m9 18 6-6-6-6",key:"mthhwq"}]],x=c("chevron-right",h);function f({currentPage:s,totalPages:t,onPageChange:i,itemsPerPage:n,totalItems:o}){if(t<=1)return null;const l=s*n+1,a=Math.min((s+1)*n,o);return e.jsxs("div",{className:"flex items-center justify-between px-4 py-4",children:[e.jsxs("div",{className:"text-sm text-gray-400",children:["Showing ",l,"-",a," of ",o]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("button",{onClick:()=>i(s-1),disabled:s===0,className:"w-10 h-10 flex items-center justify-center text-white hover:bg-zinc-800 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed","aria-label":"Previous page",children:e.jsx(r,{className:"w-5 h-5"})}),e.jsxs("div",{className:"text-sm text-white min-w-[60px] text-center",children:[s+1," / ",t]}),e.jsx("button",{onClick:()=>i(s+1),disabled:s>=t-1,className:"w-10 h-10 flex items-center justify-center text-white hover:bg-zinc-800 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed","aria-label":"Next page",children:e.jsx(x,{className:"w-5 h-5"})})]})]})}export{f as P};
