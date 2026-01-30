export enum PageType {
    ResearchPaper = 'research_paper',
    Article = 'article',
    Documentation = 'documentation',
    Repository = 'repository',
    General = 'general'
}

export interface PageMetadata {
    type: PageType;
    title: string;
    description: string;
    author?: string;
    publishDate?: string;
    readingTime: number; // minutes
    keywords: string[];
}

export class PageAnalyzer {

    public analyze(): PageMetadata {
        const type = this.detectPageType();
        const content = this.getMainContent();

        return {
            type,
            title: document.title,
            description: this.getMetaContent('description') || '',
            author: this.getMetaContent('author') || undefined,
            readingTime: this.estimateReadingTime(content),
            keywords: this.extractKeywords(content)
        };
    }

    private detectPageType(): PageType {
        const url = window.location.href.toLowerCase();
        const text = document.body.innerText.toLowerCase();

        // 1. Research Paper Heuristics
        if (
            url.includes('arxiv.org') ||
            url.includes('sciencedirect.com') ||
            url.includes('nature.com') ||
            text.includes('abstract') && text.includes('references') && text.includes('introduction') ||
            !!document.querySelector('meta[name="citation_title"]')
        ) {
            return PageType.ResearchPaper;
        }

        // 2. Repository
        if (
            url.includes('github.com') ||
            url.includes('gitlab.com') ||
            !!document.querySelector('.octicon-repo')
        ) {
            return PageType.Repository;
        }

        // 3. Documentation
        if (
            url.includes('docs.') ||
            url.includes('documentation') ||
            text.includes('api reference') ||
            text.includes('getting started')
        ) {
            return PageType.Documentation;
        }

        // 4. Article/News
        if (
            !!document.querySelector('article') ||
            !!document.querySelector('.post-content') ||
            !!document.querySelector('meta[property="og:type"][content="article"]') ||
            text.length > 2000 // Simple length heuristic
        ) {
            return PageType.Article;
        }

        return PageType.General;
    }

    private getMainContent(): string {
        // Simple heuristic to get main text
        const article = document.querySelector('article');
        if (article) return article.innerText;

        const main = document.querySelector('main');
        if (main) return main.innerText;

        return document.body.innerText;
    }

    private getMetaContent(name: string): string | null {
        const meta = document.querySelector(`meta[name="${name}"]`) ||
            document.querySelector(`meta[property="og:${name}"]`);
        return meta ? meta.getAttribute('content') : null;
    }

    private estimateReadingTime(text: string): number {
        const wpm = 200;
        const words = text.split(/\s+/).length;
        return Math.ceil(words / wpm);
    }

    private extractKeywords(text: string): string[] {
        // Simplified keyword extraction
        // In a real app, use TF-IDF from concept-linker
        return [];
    }
}
