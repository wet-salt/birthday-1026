import {get, put} from '@vercel/blob';

export const initialState = {
  content:{name:'冰激凌',message:'我要和你做一辈子的闺蜜。',quotes:['我要和你做一辈子的闺蜜。','愿你有说走就走的勇气，也有随时回来的底气。','不用每一天都很厉害，每一天都做自己就好。','下一个生日，下下个生日，都要一起过。','想见的时候就见，想说的话就说。'],letter:''},
  contentVersion:0, photos:[], progress:[],
};
const pathname = 'birthday/state-v1.json';
const options = () => ({access:'private', token:process.env.BLOB_READ_WRITE_TOKEN});

export async function readState() {
  const result = await get(pathname, {...options(), useCache:false});
  if (!result) return {data:structuredClone(initialState), etag:null};
  const data = await new Response(result.stream).json();
  return {data, etag:result.blob.etag};
}

export async function mutateState(change) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const {data, etag} = await readState();
    change(data);
    try {
      await put(pathname, JSON.stringify(data), {...options(), contentType:'application/json', cacheControlMaxAge:60, allowOverwrite:!!etag, ...(etag ? {ifMatch:etag} : {})});
      return data;
    } catch (error) {
      if (!/Precondition|already exists|already been uploaded/i.test(error.name + ' ' + error.message)) throw error;
    }
  }
  throw Object.assign(new Error('另一台设备正在保存，请稍后重试。'), {status:409});
}

export function publicState(data, role) {
  return {
    ...data.content, contentVersion:data.contentVersion,
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
