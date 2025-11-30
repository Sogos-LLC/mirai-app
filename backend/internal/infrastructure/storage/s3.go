package storage

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"path"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// S3Storage implements StorageAdapter using S3-compatible object storage.
// Works with MinIO locally and AWS S3 in production - same API.
type S3Storage struct {
	client   *s3.Client
	bucket   string
	basePath string
}

// S3Config holds S3/MinIO configuration.
type S3Config struct {
	Endpoint        string // MinIO: "http://192.168.1.226:9768", AWS: ""
	Region          string // "us-east-1"
	Bucket          string // "mirai"
	BasePath        string // "data"
	AccessKeyID     string
	SecretAccessKey string
}

// NewS3Storage creates a new S3-compatible storage adapter.
// Works with MinIO (local/staging) and AWS S3 (production).
func NewS3Storage(ctx context.Context, cfg S3Config) (*S3Storage, error) {
	if cfg.AccessKeyID == "" || cfg.SecretAccessKey == "" {
		return nil, errors.New("S3 credentials required")
	}

	var awsCfg aws.Config
	var err error

	if cfg.Endpoint != "" {
		// MinIO or S3-compatible endpoint
		customResolver := aws.EndpointResolverWithOptionsFunc(func(service, region string, options ...interface{}) (aws.Endpoint, error) {
			return aws.Endpoint{
				URL:               cfg.Endpoint,
				HostnameImmutable: true,
			}, nil
		})

		awsCfg, err = config.LoadDefaultConfig(ctx,
			config.WithRegion(cfg.Region),
			config.WithEndpointResolverWithOptions(customResolver),
			config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
				cfg.AccessKeyID,
				cfg.SecretAccessKey,
				"",
			)),
		)
	} else {
		// AWS S3 (production)
		awsCfg, err = config.LoadDefaultConfig(ctx,
			config.WithRegion(cfg.Region),
			config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
				cfg.AccessKeyID,
				cfg.SecretAccessKey,
				"",
			)),
		)
	}

	if err != nil {
		return nil, err
	}

	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		if cfg.Endpoint != "" {
			o.UsePathStyle = true // Required for MinIO
		}
	})

	return &S3Storage{
		client:   client,
		bucket:   cfg.Bucket,
		basePath: cfg.BasePath,
	}, nil
}

// fullKey returns the full S3 key with base path.
func (s *S3Storage) fullKey(p string) string {
	if s.basePath == "" {
		return p
	}
	return path.Join(s.basePath, p)
}

// ReadJSON reads and unmarshals a JSON file from S3.
func (s *S3Storage) ReadJSON(ctx context.Context, p string, v interface{}) error {
	result, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(s.fullKey(p)),
	})
	if err != nil {
		return err
	}
	defer result.Body.Close()

	data, err := io.ReadAll(result.Body)
	if err != nil {
		return err
	}

	return json.Unmarshal(data, v)
}

// WriteJSON marshals and writes data as JSON to S3.
func (s *S3Storage) WriteJSON(ctx context.Context, p string, v interface{}) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}

	_, err = s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(s.fullKey(p)),
		Body:        bytes.NewReader(data),
		ContentType: aws.String("application/json"),
	})

	return err
}

// ListFiles lists all JSON files in a directory.
func (s *S3Storage) ListFiles(ctx context.Context, directory string) ([]string, error) {
	prefix := s.fullKey(directory)
	if !strings.HasSuffix(prefix, "/") {
		prefix += "/"
	}

	result, err := s.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket: aws.String(s.bucket),
		Prefix: aws.String(prefix),
	})
	if err != nil {
		return nil, err
	}

	var files []string
	for _, obj := range result.Contents {
		key := aws.ToString(obj.Key)
		if strings.HasSuffix(key, ".json") {
			files = append(files, path.Base(key))
		}
	}

	return files, nil
}

// Delete removes a file from S3.
func (s *S3Storage) Delete(ctx context.Context, p string) error {
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(s.fullKey(p)),
	})
	return err
}

// Exists checks if a file exists in S3.
func (s *S3Storage) Exists(ctx context.Context, p string) (bool, error) {
	_, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(s.fullKey(p)),
	})
	if err != nil {
		var notFound *types.NotFound
		if errors.As(err, &notFound) {
			return false, nil
		}
		// Also check for NoSuchKey
		var noSuchKey *types.NoSuchKey
		if errors.As(err, &noSuchKey) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}
