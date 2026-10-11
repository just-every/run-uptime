import {createFileRoute,notFound} from '@tanstack/react-router'
import {DocsArticle} from '../site/docs/DocsArticle.tsx'
import {docsHead,hasDocsPage} from '../site/docs/pages.ts'
export const Route=createFileRoute('/docs/$slug')({
  beforeLoad:({params})=>{if(!hasDocsPage(params.slug))throw notFound()},
  head:({params})=>docsHead(params.slug),
  component:()=>{const {slug}=Route.useParams();return <DocsArticle slug={slug}/>},
})
