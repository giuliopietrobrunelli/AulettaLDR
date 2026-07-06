(function () {
    const tocLinks = Array.from(document.querySelectorAll('#guida-toc a'));
    const sections = Array.from(document.querySelectorAll('.guida-section'));

    if (!tocLinks.length || !sections.length) return;

    const linkById = {};
    tocLinks.forEach(link => {
        const id = link.getAttribute('href').replace('#', '');
        linkById[id] = link;
    });

    function setActive(id) {
        tocLinks.forEach(link => link.classList.remove('active'));
        const active = linkById[id];
        if (active) {
            active.classList.add('active');
            // Tiene visibile il link attivo nel sommario orizzontale su mobile
            active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
        }
    }

    // Margine dinamico: tiene conto della barra sommario fissa su mobile
    function currentRootMargin() {
        const isMobile = window.matchMedia('(max-width: 800px)').matches;
        return isMobile ? '-90px 0px -70% 0px' : '-20px 0px -70% 0px';
    }

    let observer;

    function createObserver() {
        if (observer) observer.disconnect();
        observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    setActive(entry.target.id);
                }
            });
        }, {
            root: null,
            rootMargin: currentRootMargin(),
            threshold: 0
        });
        sections.forEach(section => observer.observe(section));
    }

    createObserver();
    window.addEventListener('resize', createObserver);

    // Attiva subito la prima sezione visibile al caricamento
    setActive(sections[0].id);
})();