import type { Metadata } from "next";
import ArchiveApp from "./ArchiveApp";
export const metadata:Metadata={title:"네이버 블로그",robots:{index:false,follow:false}};
export default function Page(){return <ArchiveApp/>;}
