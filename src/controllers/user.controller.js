import { asyncHandler } from "../utils/asyncHandlers.js";
import {ApiError} from "../utils/ApiError.js"
import { User} from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken"
import mongoose from "mongoose";



// generating access and refresh tokens
const generaterefreshandaccesstokens= async(userId)=>{
   try{
    const user= await User.findById(userId);
    const accesstoken= user.generateAccessToken();
    const refreshToken= user.generateRefreshToken();
    
    user.refreshToken = refreshToken
    await user.save({validateBeforeSave : false})

    return {accesstoken,refreshToken};
   }catch{
    throw new ApiError(500,"something went wrong while JWT")
   }
}

const registerUser = asyncHandler( async (req, res) => {
    // get user details from frontend
    // validation - not empty
    // check if user already exists: username, email
    // check for images, check for avatar
    // upload them to cloudinary, avatar
    // create user object - create entry in db
    // remove password and refresh token field from response
    // check for user creation
    // return res


    const {fullName, email, username, password } = req.body
    //console.log("email: ", email);

    if (
        [fullName, email, username, password].some((field) => field?.trim() === "")
    ) {
        throw new ApiError(400, "All fields are required")
    }

    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    })

    if (existedUser) {
        throw new ApiError(409, "User with email or username already exists")
    }
    //console.log(req.files);

    const avatarLocalPath = req.files?.avatar[0]?.path;
    //const coverImageLocalPath = req.files?.coverImage[0]?.path;

    let coverImageLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path
    }
    

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if (!avatar) {
        throw new ApiError(400, "Avatar file is required")
    }
   

    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email, 
        password,
        username: username.toLowerCase()
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while registering the user")
    }

    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered Successfully")
    )

} )

const loginUser=asyncHandler(async(req,res)=>{
    // req body-> data
    const{email, username, password}= req.body
    console.log(email);

    //username or email is required
    if(!username && !email){
        throw new ApiError(400,"username or email is required")
    }

    //find the user
    const user= await User.findOne({
        $or:[{username},{email}]
    })

    if(!user){
        throw new ApiError(404,"user does not exist")
    }

    //password is valid or not
    const isPasswordValid = await user.isPasswordCorrect(password)

    if(!isPasswordValid){
        throw new ApiError(401,"password is incorrect")
    }

    // access and refresh token
    const {accesstoken,refreshToken}= await generaterefreshandaccesstokens(user._id)

    const loggedInUser= await User.findById(user._id).select("-password -refreshToken")

    //send cookie
    const option={
        httpOnly:true,
        secure: true
    }

    //return res
    return res
    .status(200)
    .cookie("accesstoken", accesstoken, option)
    .cookie("refreshToken", refreshToken, option)
    .json(
        new ApiResponse(200,{loggedInUser, refreshToken, accesstoken},"user is successfully loggedin")
    )
})

const logoutUser= asyncHandler(async(req,res)=>{

    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set:{
                refreshToken: undefined
            }
        },
        {
            new: true
        }
    )

    const option={
        httpOnly:true,
        secure: true
    }

    return res
    .status(200)
    .clearCookie("accessToken", option)
    .clearCookie("refreshToken", option)
    .json(
        new ApiResponse(200,{},"user loggedOut")
    )

})

const refreshAccessToken= asyncHandler(async(req,res)=>{
    const incomingToken= req.cookie.refreshToken || req.body.refreshToken

    if(!incomingToken){
        throw new ApiError(401, "unauthorized request")
    }

    try {
        const decodedRefreshToken=jwt.verify(incomingToken, process.env.REFRESH_TOKEN_SECRET)
    
        const user = User.findById(decodedRefreshToken?._id)
    
        if(!user){
            throw new ApiError(401, "invalid refresh token")
        }
    
        if(incomingToken !== user?.refreshToken){
            throw new ApiError(401,"Refresh token is expired or used")
        }
    
        const {accessToken , newrefreshToken}= await generaterefreshandaccesstokens(user._id)
    
        const option={
            httpOnly:true,
            secure:true
        }
    
        return res
        .status(200)
        .cookie("accessToken", accessToken, option)
        .cookie("refreshToken", newrefreshToken, option)
        .json(
            new ApiResponse(
                200,
                {accessToken, refreshToken: newrefreshToken},
                "Access token refreshed"
            )
        )
    } catch (error) {
        throw new ApiError(401,error?.message || "Invalid refresh token")
    }
})

const changeCurrentPassword= asyncHandler(async(req,res)=>{
    const {oldPassword, newPassword} = req.body

    const user= User.findById(req.user?._id)

    if(!user){
        throw new ApiError(400, "Invalid old password")
    }

    user.password= newPassword;
    await user.save({validateBeforeSave: false})

    return res
    .status(200)
    .json(new ApiResponse(200,{}, "password changed successfully"))
})

const getCurrentUser= asyncHandler(async(req,res)=>{
    return res
    .status(200)
    .json(
        new ApiResponse(200,req.user,"user fetched successfully")
    )
})

const updateAccountDetails= asyncHandler(async(req,res)=>{
    const {fullName,email}= req.body

    if(!fullName || !email){
        throw new ApiError(400, "all fields are important")
    }

    const user= User.findByIdAndUpdate(req.user?._id,
        {
            $set:{
                fullName: fullName,
                email: email
            }
        },
        {
            new: true
        }
    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(200, user, "Account details updated successfully")
    )

})

const updateAvatar= asyncHandler(async(req,res)=>{
    const avatarLocalPath = req.file.path

    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar file not found")
    }

    const avatar= await uploadOnCloudinary(avatarLocalPath)

    if(avatar.url){
        throw new ApiError(400,"Error while uploading on avatar")
    }

    const user= await User.findByIdAndUpdate(req.user?._id,
        {
            $set:{
                avatar: avatar.url 
            }
        },
        {new : true}
    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(200,user, "Avatar image updated successfully")
    )

})

const updateCoverImage= asyncHandler(async(req,res)=>{
    const CoverImageLocalPath = req.file.path

    if(!CoverImageLocalPath){
        throw new ApiError(400,"Avatar file not found")
    }

    const CoverImage= await uploadOnCloudinary(CoverImageLocalPath)

    if(CoverImage.url){
        throw new ApiError(400,"Error while uploading on avatar")
    }

    const user= await User.findByIdAndUpdate(req.user?._id,
        {
            $set:{
                CoverImage: CoverImage.url 
            }
        },
        {new : true}
    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(200,user, "CoverImage updated successfully")
    )
})

const getUserChannelProfile= asyncHandler(async(req,res)=>{
    const {username}= req.params

    if(!username?.trim()){
        throw new ApiError(400,"username is missing")
    }

    const channel = await User.aggregate([
        {
            $match:{
                username: username?.toLowerCase()
            }
        },
        {
            // subscribers mil gye
            $lookup:{
                from:"subscriptions",
                localField:"_id",
                foreignField:"channel", // select channels to get 
                as: "subscribers"       //...to get subcribers
            }
        },
        {
            // user ne kis channels ko subscribe kiya hai
            $lookup:{
                from:"subscriptions",           // from subscriptions schema (everthhing becomes lowercase and plural)
                localField:"_id",
                foreignField:"subscriber",      //select subcribers to get 
                as: "subscribedTo"              // ...to get channels
            }
        },
        {
            $addFields:{
                subscribersCount:{
                    $size:"$subscribers"
                },
                channelIsSubscribedTo:{
                    $size:"$subscribedTo"
                },
                isSubscribed:{
                    $cond:{
                        if:{$in:[req.user?._id,"$subscribers.subscriber"]},
                        then:true,
                        else:false
                    }
                }
            }
        },
        {
            $project:{
                fullName:1,
                username: 1,
                subscribersCount: 1,
                channelsSubscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1,
                email: 1
            }
        }
    ])

    if(!channel?.length){
        throw new ApiError(404,"channel does not exist")
    }

    return res
    .status(200)
    .json(
        new ApiResponse(200,channel[0],"user channel fetched successfully")
    )
})

const getWatchHistory = asyncHandler(async(req,res)=>{
    const user= await User.aggregate([
        {
            $match:{
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup:{
                from:"videos",
                localField:"WatchHistory",
                foreignField:"_id",
                as:"WatchHistory",
                pipeline:[
                    {
                        $lookup:{
                            from:"users",
                            localField:"owner",
                            foreignField:"_id",
                            as:"owner",
                            pipeline:[
                                {
                                    $project:{
                                        fullName: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields:{
                            owner:{
                                $first:"$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])

    return res
    .status(200)
    .json(
        new ApiResponse(200, user[0].watchHistory,"Watch history fetched successfully")
    )
})


export{registerUser, loginUser, logoutUser, refreshAccessToken, changeCurrentPassword, getCurrentUser, updateAccountDetails, updateAvatar, updateCoverImage,getUserChannelProfile,getWatchHistory}