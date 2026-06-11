// percorso immagine di profilo di default
export const STOCK_PROFILE_PIC = '/src/img/yellow-profile-picture.webp';

// restituisce l'url dell'immagine profilo dell'utente, oppure quella di default
export function getProfilePicUrl(profilo) {
  return profilo?.foto_profilo || STOCK_PROFILE_PIC;
}

// aggiorna tutte le immagini di profilo nell'interfaccia con quella dell'utente loggato
export function syncProfilePictures(profilo) {
  const url = getProfilePicUrl(profilo);
  document.querySelectorAll('[data-profile-pic]').forEach((el) => {
    el.src = url;
  });
}