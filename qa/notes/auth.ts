export function useAuth(){return {user:{id:"qa-user",fullName:"QA user"},loading:false,promptSignIn:async()=>{}};}
export function useConvexSignedIn(){return {...useAuth(),ready:true,loading:false};}
