import { User } from "../models/user.model"
import { ApiError } from "../utils/ApiError"
import jwt from "jsonwebtoken"
import { asyncHandler } from "../utils/asyncHandlers"


export const verifyJwt= asyncHandler(async(req,res,next)=>{
    try {
        const token= req.cookie?.accessToken || req.header("Authorization")?.replace("Bearer","")
        
        if(!token){
            throw new ApiError(401,"unauthorized request")
        }
        
        const decodedToken= jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
        
        const user= User.findById(decodedToken?._id).select("-password -refreshToken") // _id is from user.model.js > generateRefreshToken function
        
        if(!user){
            throw new ApiError(401,"invalid Access token")
        }
        
        req.user = user;
        next();
    
    } catch (error) {
        throw new ApiError(401, error?.message ||"invalid access token")
    }
})
