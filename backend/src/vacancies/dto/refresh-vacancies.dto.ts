/**
 * Opciones del refresco.
 *
 * Sin decoradores de validacion a proposito: todos los campos son opcionales y el
 * servicio ya acota `maxPages` al tope duro, que es donde tiene que estar el limite
 * de todos modos. Un DTO que valida lo que el servicio vuelve a acotar es una
 * segunda verdad sobre el mismo limite.
 */
export class RefreshVacanciesDto {
  /** Termino de busqueda del feed. Vacio trae el universo entero. */
  query?: string;

  /** Categoria del feed, por ejemplo "Full Stack". */
  category?: string;

  /** Tope de paginas a recorrer, para probar sin bajar las 33. */
  maxPages?: number;
}
