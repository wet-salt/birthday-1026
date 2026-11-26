import {get, head, put} from '@vercel/blob';

export const initialState = {
  content:{name:'冰激凌',message:'我要和你做一辈子的闺蜜。',quotes:['我要和你做一辈子的闺蜜。','愿你有说走就走的勇气，也有随时回来的底气。','不用每一天都很厉害，每一天都做自己就好。','下一个11月26日，下下个11月26日，都要一起纪念。','想见的时候就见，想说的话就说。'],letter:''},
  contentVersion:0, photos:[], progress:[],
};
const pathname = 'birthday/state-v1.json';
const options = () => ({access:'private', token:process.env.BLOB_READ_WRITE_TOKEN});

async function storageVersion() {
  try { return (await head(pathname, options())).etag; }
  catch (error) { if (error.name === 'BlobNotFoundError') return null; throw error; }
}

export async function readState(forWrite = false) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const before = forWrite ? await storageVersion() : null;
    const result = await get(pathname, {...options(), useCache:false, headers:{'Accept-Encoding':'identity'}});
    if (!result) {
      if (before) continue;
      return {data:structuredClone(initialState), etag:null};
    }
    const data = await new Response(result.stream).json();
    if (!forWrite) return {data, etag:result.blob.etag};
    const after = await storageVersion();
    if (before && before === after) {
      // Delivery ETags can describe a transformed response. Conditional writes
      // must use the storage API's version, paired with a stable content read.
      if (result.blob.etag !== before) console.info('birthday_storage: delivery_etag_differs');
      return {data, etag:before};
    }
  }
  throw Object.assign(new Error('云端版本暂时未能确认，请点重试。'), {status:409});
}

export async function mutateState(change) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const {data, etag} = await readState(true);
    change(data);
    try {
      await put(pathname, JSON.stringify(data), {...options(), contentType:'application/json', cacheControlMaxAge:60, allowOverwrite:!!etag, ...(etag ? {ifMatch:etag} : {})});
      return data;
    } catch (error) {
      if (!/Precondition|already exists|already been uploaded/i.test(error.name + ' ' + error.message)) throw error;
      await new Promise(resolve => setTimeout(resolve, 100 * 2 ** attempt));
    }
  }
  throw Object.assign(new Error('云端暂时未能完成保存，请点重试。'), {status:409});
}

export function publicState(data, role) {
  return {
    ...data.content, quotes:data.content.quotes.map(quote=>quote==='下一个生日，下下个生日，都要一起过。'?'下一个11月26日，下下个11月26日，都要一起纪念。':quote), contentVersion:data.contentVersion,
    photos:data.photos.filter(p => !p.deletedAt).map(({id,caption}) => ({id,caption,src:'/api/photo?id=' + id})),
    deletedPhotos:data.photos.filter(p => p.deletedAt).map(({id,caption}) => ({id,caption})),
    progress:role === 'owner' ? [] : data.progress,
    role,
  };
}

export async function putPhoto(id, bytes) {
  return put('birthday/photos/' + id + '.jpg', bytes, {...options(), contentType:'image/jpeg', allowOverwrite:false});
}

export async function getPhoto(id) {
  return get('birthday/photos/' + id + '.jpg', options());
}
